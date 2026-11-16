const PALETTE = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6', '#EC4899', '#84CC16'];
const DATA_KEY = 'chart_builder_datasets';
const CHART_KEY = 'chart_builder_charts';

const state = {
  datasets: [],
  charts: [],
  screen: { name: 'home' }
};

const manual = {
  name: 'My data',
  colsText: '',
  columns: [],
  rows: [],
  inputs: []
};

let builder = null;
let currentDraw = null;
let deferredPrompt = null;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function uid() {
  return crypto.randomUUID();
}

function formatNum(value) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
  return value.toFixed(2);
}

function toNum(value) {
  const text = String(value ?? '').trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function cell(dataset, row, column) {
  const index = dataset.columns.indexOf(column);
  if (index < 0) return '';
  return String(row[index] ?? '').trim();
}

function isNumeric(dataset, column) {
  const values = dataset.rows.map((row) => cell(dataset, row, column)).filter((value) => value !== '');
  return values.length > 0 && values.every((value) => toNum(value) !== null);
}

function stats(dataset, column) {
  const values = dataset.rows.map((row) => toNum(cell(dataset, row, column))).filter((value) => value !== null);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min, max, avg };
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && inQuotes && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function parseCsv(name, text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return null;
  const header = splitCsvLine(lines[0]).map((column) => column || 'Column');
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return header.map((_, index) => cells[index] ?? '');
  });
  return { id: uid(), name, columns: header, rows };
}

function buildChartData(dataset, labelColumn, valueColumns) {
  const groups = new Map();
  dataset.rows.forEach((row) => {
    const label = cell(dataset, row, labelColumn) || '(blank)';
    if (!groups.has(label)) groups.set(label, valueColumns.map(() => 0));
    const bucket = groups.get(label);
    valueColumns.forEach((column, index) => {
      bucket[index] += toNum(cell(dataset, row, column)) || 0;
    });
  });
  return {
    labels: [...groups.keys()],
    series: valueColumns.map((column, index) => ({
      name: column,
      values: [...groups.values()].map((bucket) => bucket[index])
    }))
  };
}

function loadStore() {
  try {
    state.datasets = JSON.parse(localStorage.getItem(DATA_KEY) || '[]');
    state.charts = JSON.parse(localStorage.getItem(CHART_KEY) || '[]');
    if (!Array.isArray(state.datasets)) state.datasets = [];
    if (!Array.isArray(state.charts)) state.charts = [];
  } catch {
    state.datasets = [];
    state.charts = [];
  }
}

function saveStore() {
  localStorage.setItem(DATA_KEY, JSON.stringify(state.datasets));
  localStorage.setItem(CHART_KEY, JSON.stringify(state.charts));
}

function toast(message) {
  document.querySelectorAll('.toast').forEach((node) => node.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function hrefFor(screen) {
  if (screen.name === 'manual') return '#/manual';
  if (screen.name === 'saved') return '#/saved';
  if (screen.name === 'dataset') return `#/dataset/${encodeURIComponent(screen.id)}`;
  if (screen.name === 'chart') return `#/chart/${encodeURIComponent(screen.id)}`;
  return '#/';
}

function parseHash() {
  const parts = (location.hash.replace(/^#/, '') || '/').split('/').filter(Boolean);
  if (parts[0] === 'manual') return { name: 'manual' };
  if (parts[0] === 'saved') return { name: 'saved' };
  if (parts[0] === 'dataset' && parts[1]) return { name: 'dataset', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'chart' && parts[1]) return { name: 'chart', id: decodeURIComponent(parts[1]) };
  return { name: 'home' };
}

function go(screen) {
  const next = hrefFor(screen);
  if ((location.hash || '#/') === next) {
    state.screen = screen;
    render();
    return;
  }
  location.hash = next.slice(1);
}

function findDataset(id) {
  return state.datasets.find((dataset) => dataset.id === id) || null;
}

function topbar(title, showBack) {
  const leading = showBack
    ? '<button class="back" type="button" data-action="back">Back</button>'
    : '<span class="logo" aria-hidden="true"><i></i><i></i><i></i></span>';
  return `<header class="topbar">${leading}<h1>${esc(title)}</h1></header>`;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function installCard() {
  if (isStandalone() || localStorage.getItem('cb-hide-install') === '1') return '';
  return `
    <section class="install" id="install-card">
      <strong>Install on your phone</strong>
      <p>Add Chart Builder to your home screen. It opens full screen, like an app, and works offline.</p>
      <div class="stack">
        <button class="btn btn-primary" type="button" id="install-btn" data-action="install" hidden>Install app</button>
        <p class="small" id="ios-help" hidden>On iPhone, tap the Share button, then <b>Add to Home Screen</b>.</p>
        <p class="small" id="android-help" hidden>Open the browser menu and tap <b>Install app</b> or <b>Add to Home screen</b>.</p>
        <button class="btn btn-text" type="button" data-action="dismiss-install">Not now</button>
      </div>
    </section>`;
}

function updateInstallUI() {
  const card = document.getElementById('install-card');
  if (!card) return;
  const button = document.getElementById('install-btn');
  const ios = document.getElementById('ios-help');
  const android = document.getElementById('android-help');
  if (button) button.hidden = !deferredPrompt;
  if (ios) ios.hidden = Boolean(deferredPrompt) || !isIos();
  if (android) android.hidden = Boolean(deferredPrompt) || isIos();
}

function homeHtml() {
  const cards = state.datasets.length
    ? state.datasets.map((dataset) => `
        <button class="card" type="button" data-action="open-dataset" data-id="${esc(dataset.id)}">
          <strong>${esc(dataset.name)}</strong>
          <span>${dataset.rows.length} rows · ${dataset.columns.length} columns</span>
        </button>`).join('')
    : '<p class="muted">No datasets yet. Upload a CSV, load the sample, or enter data manually.</p>';

  return `
    ${topbar('Chart Builder', false)}
    <main class="content">
      ${installCard()}
      <p class="lead">Build bar, pie, and line charts from a spreadsheet. Everything stays on this phone.</p>
      <div class="stack">
        <button class="btn btn-primary" type="button" data-action="upload">Upload CSV file</button>
        <input id="csv-input" type="file" accept=".csv,text/csv,text/plain,*/*" hidden />
        <button class="btn btn-outline" type="button" data-action="sample">Load sample CSV</button>
        <button class="btn btn-outline" type="button" data-action="manual">Enter data manually</button>
        <button class="btn btn-outline" type="button" data-action="saved">Saved charts (${state.charts.length})</button>
      </div>
      <h2 class="section-title">Your datasets</h2>
      ${cards}
    </main>`;
}

function manualHtml() {
  if (!manual.columns.length) {
    return `
      ${topbar('Enter data manually', true)}
      <main class="content">
        <label class="field">
          <em>Dataset name</em>
          <input class="text-input" data-bind="manual-name" type="text" value="${esc(manual.name)}" autocomplete="off" />
        </label>
        <label class="field">
          <em>Column names, comma separated (e.g. Month, Sales, Cost)</em>
          <input class="text-input" data-bind="manual-cols" type="text" value="${esc(manual.colsText)}" autocomplete="off" />
        </label>
        <button class="btn btn-primary" type="button" data-action="create-table" ${manual.colsText.trim() ? '' : 'disabled'}>Create table</button>
      </main>`;
  }

  const tableRows = manual.rows.length
    ? manual.rows.map((row) => `<div class="row-line">${esc(row.join('  |  '))}</div>`).join('')
    : '<p class="muted">No rows yet</p>';
  const inputs = manual.columns.map((column, index) => `
    <label class="field">
      <em>${esc(column)}</em>
      <input class="text-input" data-bind="manual-cell" data-index="${index}" type="text" value="${esc(manual.inputs[index] || '')}" autocomplete="off" />
    </label>`).join('');

  return `
    ${topbar('Enter data manually', true)}
    <main class="content">
      <p><strong>Table: ${esc(manual.name || 'My data')}</strong></p>
      <div class="card">
        <strong>${esc(manual.columns.join('  |  '))}</strong>
        ${tableRows}
      </div>
      <h2 class="section-title">New row</h2>
      ${inputs}
      <div class="stack">
        <button class="btn btn-primary" type="button" data-action="add-row">Add row</button>
        <button class="btn btn-outline" type="button" data-action="save-dataset" ${manual.rows.length ? '' : 'disabled'}>Save dataset</button>
        <button class="btn btn-text" type="button" data-action="reset-table">Reset table</button>
      </div>
    </main>`;
}

function ensureBuilder(dataset) {
  if (builder && builder.datasetId === dataset.id) return builder;
  const numeric = dataset.columns.filter((column) => isNumeric(dataset, column));
  const categorical = dataset.columns.filter((column) => !numeric.includes(column));
  builder = {
    datasetId: dataset.id,
    type: 'BAR',
    labelCol: categorical[0] || dataset.columns[0],
    selected: new Set(numeric.slice(0, 1)),
    title: `${dataset.name} chart`,
    shown: null
  };
  return builder;
}

function datasetHtml() {
  const dataset = findDataset(state.screen.id);
  if (!dataset) {
    return `${topbar('Dataset not found', true)}<main class="content"><p class="muted">This dataset is no longer on this phone.</p></main>`;
  }

  const form = ensureBuilder(dataset);
  const numeric = dataset.columns.filter((column) => isNumeric(dataset, column));
  const categorical = dataset.columns.filter((column) => !numeric.includes(column));
  const preview = dataset.rows.slice(0, 8);
  const statLines = numeric.map((column) => {
    const summary = stats(dataset, column);
    if (!summary) return '';
    return `<p class="small">${esc(column)} → min ${formatNum(summary.min)}, max ${formatNum(summary.max)}, avg ${formatNum(summary.avg)}</p>`;
  }).join('');

  const typeChips = ['BAR', 'PIE', 'LINE'].map((type) => {
    const label = type.charAt(0) + type.slice(1).toLowerCase();
    return `<button class="chip ${form.type === type ? 'on' : ''}" type="button" data-action="type" data-type="${type}">${label}</button>`;
  }).join('');
  const labelChips = dataset.columns.map((column) => `
    <button class="chip ${form.labelCol === column ? 'on' : ''}" type="button" data-action="label" data-col="${esc(column)}">${esc(column)}</button>`).join('');
  const checks = numeric.length
    ? numeric.map((column) => `
        <label class="check">
          <input type="checkbox" data-action="toggle-value" value="${esc(column)}" ${form.selected.has(column) ? 'checked' : ''} />
          <span>${esc(column)}</span>
        </label>`).join('')
    : '<p class="muted">This dataset has no numeric columns to chart.</p>';

  let chartBlock = '';
  if (form.shown) {
    const chart = form.shown;
    const data = buildChartData(dataset, chart.labelColumn, chart.valueColumns);
    currentDraw = { type: chart.type, data };
    chartBlock = chartMarkup(chart, dataset);
  }

  const pieNote = `<p class="small" id="pie-note" ${form.type === 'PIE' && form.selected.size > 1 ? '' : 'hidden'}>Pie charts use the first selected value column.</p>`;

  return `
    ${topbar(dataset.name, true)}
    <main class="content">
      <h2 class="section-title">Summary</h2>
      <div class="stats">
        <div class="stat"><b>${dataset.rows.length}</b><span>Rows</span></div>
        <div class="stat"><b>${dataset.columns.length}</b><span>Columns</span></div>
      </div>
      <p class="small">Numeric: ${esc(numeric.length ? numeric.join(', ') : 'none')}</p>
      <p class="small">Categorical: ${esc(categorical.length ? categorical.join(', ') : 'none')}</p>
      ${statLines}
      <h2 class="section-title">Data preview</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>${dataset.columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead>
          <tbody>
            ${preview.map((row) => `<tr>${dataset.columns.map((_, index) => `<td>${esc(row[index] ?? '')}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${dataset.rows.length > preview.length ? `<p class="small">Showing ${preview.length} of ${dataset.rows.length} rows.</p>` : ''}
      <h2 class="section-title">Build a chart</h2>
      <p class="small">Chart type</p>
      <div class="choices">${typeChips}</div>
      <p class="small">Categories (X axis / slices)</p>
      <div class="choices">${labelChips}</div>
      <p class="small">Values (numeric columns)</p>
      ${checks}
      <label class="field">
        <em>Chart title</em>
        <input class="text-input" data-bind="chart-title" type="text" value="${esc(form.title)}" autocomplete="off" />
      </label>
      <button class="btn btn-primary" type="button" data-action="show-chart" ${form.selected.size ? '' : 'disabled'}>Show chart</button>
      ${pieNote}
      ${chartBlock}
      <button class="btn btn-danger" type="button" data-action="delete-dataset" data-id="${esc(dataset.id)}">Delete dataset</button>
    </main>`;
}

function chartMarkup(chart, dataset) {
  const data = buildChartData(dataset, chart.labelColumn, chart.type === 'PIE' ? chart.valueColumns.slice(0, 1) : chart.valueColumns);
  const legend = chart.type === 'PIE' ? pieLegend(data) : seriesLegend(data);
  return `
    <section class="card chart-card" id="chart-card">
      <strong>${esc(chart.title)}</strong>
      <span>Type: ${esc(chart.type.toLowerCase())} · Categories: ${esc(chart.labelColumn)} · Values: ${esc(chart.valueColumns.join(', '))}</span>
      ${data.labels.length ? '<canvas class="chart" id="chart-canvas"></canvas>' : '<p class="muted">No data to chart.</p>'}
      <div class="legend">${legend}</div>
      ${state.screen.name === 'dataset' ? '<button class="btn btn-outline" type="button" data-action="save-chart">Save chart</button>' : '<button class="btn btn-danger" type="button" data-action="delete-chart" data-id="' + esc(chart.id) + '">Delete chart</button>'}
    </section>`;
}

function seriesLegend(data) {
  return data.series.map((series, index) => `
    <div class="legend-row"><span class="dot" style="background:${PALETTE[index % PALETTE.length]}"></span>${esc(series.name)}</div>`).join('');
}

function pieLegend(data) {
  const values = data.series[0] ? data.series[0].values : [];
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return data.labels.map((label, index) => {
    const value = values[index] || 0;
    return `<div class="legend-row"><span class="dot" style="background:${PALETTE[index % PALETTE.length]}"></span>${esc(label)}: ${formatNum(value)} (${formatNum(value / total * 100)}%)</div>`;
  }).join('');
}

function savedHtml() {
  const cards = state.charts.length
    ? state.charts.map((chart) => {
        const dataset = findDataset(chart.datasetId);
        const name = dataset ? dataset.name : 'Deleted dataset';
        return `
          <button class="card" type="button" data-action="open-chart" data-id="${esc(chart.id)}">
            <strong>${esc(chart.title)}</strong>
            <span>${esc(chart.type.toLowerCase())} chart · ${esc(name)}</span>
          </button>`;
      }).join('')
    : '<p class="muted">No saved charts yet. Open a dataset, build a chart and tap Save chart.</p>';
  return `${topbar('Saved charts', true)}<main class="content">${cards}</main>`;
}

function chartPageHtml() {
  const chart = state.charts.find((item) => item.id === state.screen.id);
  const dataset = chart ? findDataset(chart.datasetId) : null;
  if (!chart || !dataset) {
    return `${topbar('Chart not found', true)}<main class="content"><p class="muted">This chart is no longer available.</p></main>`;
  }
  const data = buildChartData(dataset, chart.labelColumn, chart.type === 'PIE' ? chart.valueColumns.slice(0, 1) : chart.valueColumns);
  currentDraw = { type: chart.type, data };
  return `${topbar('Saved chart', true)}<main class="content">${chartMarkup(chart, dataset)}</main>`;
}

function render() {
  currentDraw = null;
  const app = document.getElementById('app');
  const screen = state.screen.name;
  const html = screen === 'manual' ? manualHtml()
    : screen === 'dataset' ? datasetHtml()
    : screen === 'saved' ? savedHtml()
    : screen === 'chart' ? chartPageHtml()
    : homeHtml();
  app.innerHTML = html;
  updateInstallUI();
  requestAnimationFrame(() => requestAnimationFrame(drawVisible));
}

function drawVisible() {
  const canvas = document.getElementById('chart-canvas');
  if (!canvas || !currentDraw || !currentDraw.data.labels.length) return;
  drawChart(canvas, currentDraw.type, currentDraw.data);
}

function drawChart(canvas, type, data) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) {
    setTimeout(drawVisible, 50);
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (type === 'PIE') drawPie(ctx, width, height, data);
  else if (type === 'LINE') drawLine(ctx, width, height, data);
  else drawBars(ctx, width, height, data);
}

function axisLabel(ctx, text, x, y, align) {
  ctx.fillStyle = '#4b5563';
  ctx.font = '11px Segoe UI, system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawAxes(ctx, left, right, top, bottom, minValue, maxValue) {
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  for (let step = 0; step <= 4; step += 1) {
    const y = bottom - ((bottom - top) * step) / 4;
    const value = minValue + ((maxValue - minValue) * step) / 4;
    if (step > 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    axisLabel(ctx, formatNum(value), left - 6, y, 'right');
  }
}

function categoryLabel(ctx, label, x, y, many) {
  const text = String(label).slice(0, many ? 10 : 8);
  if (!many) {
    axisLabel(ctx, text, x, y, 'center');
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 5);
  axisLabel(ctx, text, 0, 0, 'right');
  ctx.restore();
}

function drawBars(ctx, width, height, data) {
  const maxValue = Math.max(1e-9, ...data.series.flatMap((series) => series.values));
  const left = 52;
  const right = width - 12;
  const top = 16;
  const many = data.labels.length > 6;
  const bottom = height - (many ? 72 : 36);
  drawAxes(ctx, left, right, top, bottom, 0, maxValue);
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const groupWidth = plotWidth / Math.max(data.labels.length, 1);
  const barWidth = (groupWidth * 0.8) / Math.max(data.series.length, 1);
  data.labels.forEach((label, index) => {
    const groupX = left + index * groupWidth + groupWidth * 0.1;
    data.series.forEach((series, seriesIndex) => {
      const barHeight = (series.values[index] / maxValue) * plotHeight;
      ctx.fillStyle = PALETTE[seriesIndex % PALETTE.length];
      const x = groupX + seriesIndex * barWidth;
      const y = bottom - barHeight;
      roundTopRect(ctx, x, y, barWidth * 0.86, barHeight, 4);
    });
    categoryLabel(ctx, label, left + index * groupWidth + groupWidth / 2, bottom + 14, many);
  });
}

function roundTopRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawPie(ctx, width, height, data) {
  const values = data.series[0] ? data.series[0].values : [];
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const diameter = Math.min(width, height) * 0.78;
  const x = (width - diameter) / 2;
  const y = (height - diameter) / 2;
  let start = -Math.PI / 2;
  values.forEach((value, index) => {
    const sweep = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + diameter / 2, y + diameter / 2);
    ctx.fillStyle = PALETTE[index % PALETTE.length];
    ctx.arc(x + diameter / 2, y + diameter / 2, diameter / 2, start, start + sweep);
    ctx.closePath();
    ctx.fill();
    start += sweep;
  });
}

function drawLine(ctx, width, height, data) {
  const all = data.series.flatMap((series) => series.values);
  const minValue = Math.min(0, ...all, 0);
  const maxValue = Math.max(...all, 1);
  const range = maxValue - minValue || 1;
  const left = 52;
  const right = width - 12;
  const top = 16;
  const many = data.labels.length > 6;
  const bottom = height - (many ? 72 : 36);
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const count = data.labels.length;
  const xAt = (index) => (count <= 1 ? left + plotWidth / 2 : left + (plotWidth * index) / (count - 1));
  const yAt = (value) => bottom - plotHeight * ((value - minValue) / range);
  drawAxes(ctx, left, right, top, bottom, minValue, maxValue);
  data.series.forEach((series, seriesIndex) => {
    const color = PALETTE[seriesIndex % PALETTE.length];
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    series.values.forEach((value, index) => {
      const x = xAt(index);
      const y = yAt(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    series.values.forEach((value, index) => {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(xAt(index), yAt(value), 4, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  data.labels.forEach((label, index) => categoryLabel(ctx, label, xAt(index), bottom + 14, many));
}

function resetManual() {
  manual.name = 'My data';
  manual.colsText = '';
  manual.columns = [];
  manual.rows = [];
  manual.inputs = [];
}

function addDataset(dataset) {
  state.datasets = state.datasets.concat(dataset);
  saveStore();
  go({ name: 'dataset', id: dataset.id });
}

async function loadSample() {
  try {
    const response = await fetch('/sample/sales_2026.csv');
    if (!response.ok) throw new Error('missing');
    const dataset = parseCsv('sales_2026.csv', await response.text());
    if (!dataset) throw new Error('bad');
    addDataset(dataset);
  } catch {
    toast('Could not load the sample CSV.');
  }
}

function onClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;

  if (action === 'back') {
    if (history.length > 1) history.back();
    else go({ name: 'home' });
    return;
  }
  if (action === 'upload') {
    document.getElementById('csv-input')?.click();
    return;
  }
  if (action === 'sample') {
    loadSample();
    return;
  }
  if (action === 'manual') {
    resetManual();
    go({ name: 'manual' });
    return;
  }
  if (action === 'saved') {
    go({ name: 'saved' });
    return;
  }
  if (action === 'open-dataset') {
    go({ name: 'dataset', id: target.dataset.id });
    return;
  }
  if (action === 'open-chart') {
    go({ name: 'chart', id: target.dataset.id });
    return;
  }
  if (action === 'dismiss-install') {
    localStorage.setItem('cb-hide-install', '1');
    render();
    return;
  }
  if (action === 'install') {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
      updateInstallUI();
    });
    return;
  }
  if (action === 'create-table') {
    const columns = manual.colsText.split(',').map((column) => column.trim()).filter(Boolean);
    const unique = [...new Set(columns)];
    if (!unique.length) return;
    manual.columns = unique;
    manual.inputs = unique.map(() => '');
    manual.rows = [];
    render();
    return;
  }
  if (action === 'add-row') {
    manual.rows.push(manual.inputs.map((value) => value.trim()));
    manual.inputs = manual.columns.map(() => '');
    render();
    return;
  }
  if (action === 'reset-table') {
    manual.columns = [];
    manual.rows = [];
    manual.inputs = [];
    render();
    return;
  }
  if (action === 'save-dataset') {
    if (!manual.rows.length) return;
    addDataset({
      id: uid(),
      name: manual.name.trim() || 'Manual data',
      columns: manual.columns.slice(),
      rows: manual.rows.map((row) => row.slice())
    });
    return;
  }
  if (action === 'type' && builder) {
    builder.type = target.dataset.type;
    render();
    return;
  }
  if (action === 'label' && builder) {
    builder.labelCol = target.dataset.col;
    render();
    return;
  }
  if (action === 'show-chart') {
    const dataset = findDataset(state.screen.id);
    if (!dataset || !builder) return;
    const numeric = dataset.columns.filter((column) => isNumeric(dataset, column));
    const valueColumns = numeric.filter((column) => builder.selected.has(column));
    if (!valueColumns.length) return;
    builder.shown = {
      id: uid(),
      title: builder.title.trim() || 'Chart',
      datasetId: dataset.id,
      type: builder.type,
      labelColumn: builder.labelCol,
      valueColumns
    };
    render();
    document.getElementById('chart-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (action === 'save-chart' && builder?.shown) {
    state.charts = state.charts.concat(builder.shown);
    saveStore();
    toast('Chart saved on this phone');
    go({ name: 'saved' });
    return;
  }
  if (action === 'delete-dataset') {
    if (!confirm('Delete this dataset and its saved charts?')) return;
    const id = target.dataset.id;
    state.datasets = state.datasets.filter((dataset) => dataset.id !== id);
    state.charts = state.charts.filter((chart) => chart.datasetId !== id);
    saveStore();
    go({ name: 'home' });
    return;
  }
  if (action === 'delete-chart') {
    if (!confirm('Delete this chart?')) return;
    state.charts = state.charts.filter((chart) => chart.id !== target.dataset.id);
    saveStore();
    go({ name: 'saved' });
  }
}

function onInput(event) {
  const input = event.target;
  const bind = input.dataset.bind;
  if (bind === 'manual-name') manual.name = input.value;
  if (bind === 'manual-cols') {
    manual.colsText = input.value;
    const button = document.querySelector('[data-action="create-table"]');
    if (button) button.disabled = !input.value.trim();
  }
  if (bind === 'manual-cell') manual.inputs[Number(input.dataset.index)] = input.value;
  if (bind === 'chart-title' && builder) builder.title = input.value;
}

function onChange(event) {
  const input = event.target;
  if (input.dataset.action === 'toggle-value' && builder) {
    if (input.checked) builder.selected.add(input.value);
    else builder.selected.delete(input.value);
    const button = document.querySelector('[data-action="show-chart"]');
    if (button) button.disabled = builder.selected.size === 0;
    const note = document.getElementById('pie-note');
    if (note) note.hidden = !(builder.type === 'PIE' && builder.selected.size > 1);
  }
  if (input.id === 'csv-input' && input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataset = parseCsv(file.name || 'Imported CSV', String(reader.result || ''));
      input.value = '';
      if (!dataset) {
        toast('Could not read this CSV. It needs a header row and at least one data row.');
        return;
      }
      addDataset(dataset);
    };
    reader.readAsText(file);
  }
}

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function start() {
  loadStore();
  document.body.addEventListener('click', onClick);
  document.body.addEventListener('input', onInput);
  document.body.addEventListener('change', onChange);
  window.addEventListener('hashchange', () => {
    state.screen = parseHash();
    render();
  });
  window.addEventListener('resize', drawVisible);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallUI();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const card = document.getElementById('install-card');
    if (card) card.hidden = true;
  });
  if (!location.hash) location.hash = '#/';
  else {
    state.screen = parseHash();
    render();
  }
  registerWorker();
}

start();
