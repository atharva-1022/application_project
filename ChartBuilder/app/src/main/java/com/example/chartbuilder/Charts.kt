package com.example.chartbuilder

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Palette = listOf(
    Color(0xFF4F46E5), // indigo
    Color(0xFF10B981), // green
    Color(0xFFF59E0B), // amber
    Color(0xFFEF4444), // red
    Color(0xFF06B6D4), // cyan
    Color(0xFF8B5CF6), // violet
    Color(0xFFEC4899), // pink
    Color(0xFF84CC16)  // lime
)

/** Draws text directly on the canvas. Used for axis labels and category names. */
private fun DrawScope.drawLabel(
    text: String,
    x: Float,
    y: Float,
    align: Paint.Align = Paint.Align.CENTER
) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = 11.sp.toPx()
        textAlign = align
        color = android.graphics.Color.DKGRAY
    }
    drawContext.canvas.nativeCanvas.drawText(text, x, y, paint)
}

/** Draws the Y-axis, horizontal grid lines and value ticks. */
private fun DrawScope.drawAxes(
    left: Float, right: Float, top: Float, bottom: Float,
    minV: Double, maxV: Double
) {
    drawLine(Color.Gray, Offset(left, top), Offset(left, bottom), strokeWidth = 2f)
    drawLine(Color.Gray, Offset(left, bottom), Offset(right, bottom), strokeWidth = 2f)
    for (k in 0..4) {
        val y = bottom - (bottom - top) * k / 4
        val v = minV + (maxV - minV) * k / 4
        if (k > 0) drawLine(Color(0x22000000), Offset(left, y), Offset(right, y), strokeWidth = 1f)
        drawLabel(formatNum(v), left - 6.dp.toPx(), y + 4.dp.toPx(), Paint.Align.RIGHT)
    }
}

@Composable
fun BarChart(data: ChartData) {
    val maxV = (data.series.flatMap { it.second }.maxOrNull() ?: 0.0).coerceAtLeast(1e-9)
    Canvas(Modifier.fillMaxWidth().height(280.dp)) {
        val left = 56.dp.toPx()
        val right = size.width - 12.dp.toPx()
        val top = 16.dp.toPx()
        val bottom = size.height - 44.dp.toPx()
        val plotW = right - left
        val plotH = bottom - top

        drawAxes(left, right, top, bottom, 0.0, maxV)

        val groupW = plotW / data.labels.size.coerceAtLeast(1)
        val barW = groupW * 0.8f / data.series.size.coerceAtLeast(1)
        data.labels.forEachIndexed { i, label ->
            val groupX = left + i * groupW + groupW * 0.1f
            data.series.forEachIndexed { s, (_, values) ->
                val h = (values[i] / maxV * plotH).toFloat()
                drawRect(
                    color = Palette[s % Palette.size],
                    topLeft = Offset(groupX + s * barW, bottom - h),
                    size = Size(barW * 0.9f, h)
                )
            }
            drawLabel(label.take(8), left + i * groupW + groupW / 2, bottom + 16.dp.toPx())
        }
    }
}

@Composable
fun PieChart(data: ChartData) {
    val values = data.series.first().second
    val total = values.sum().takeIf { it > 0 } ?: 1.0
    Canvas(Modifier.fillMaxWidth().height(280.dp)) {
        val d = minOf(size.width, size.height) * 0.85f
        val topLeft = Offset((size.width - d) / 2, (size.height - d) / 2)
        var start = -90f
        values.forEachIndexed { i, v ->
            val sweep = (v / total * 360).toFloat()
            drawArc(
                color = Palette[i % Palette.size],
                startAngle = start,
                sweepAngle = sweep,
                useCenter = true,
                topLeft = topLeft,
                size = Size(d, d)
            )
            start += sweep
        }
    }
}

@Composable
fun LineChart(data: ChartData) {
    val all = data.series.flatMap { it.second }
    val minV = minOf(0.0, all.minOrNull() ?: 0.0)
    val maxV = all.maxOrNull() ?: 1.0
    val range = (maxV - minV).takeIf { it > 0 } ?: 1.0

    Canvas(Modifier.fillMaxWidth().height(280.dp)) {
        val left = 56.dp.toPx()
        val right = size.width - 12.dp.toPx()
        val top = 16.dp.toPx()
        val bottom = size.height - 44.dp.toPx()
        val plotW = right - left
        val plotH = bottom - top
        val n = data.labels.size

        fun xAt(i: Int): Float = if (n <= 1) left + plotW / 2 else left + plotW * i / (n - 1)
        fun yAt(v: Double): Float = (bottom - plotH * ((v - minV) / range)).toFloat()

        drawAxes(left, right, top, bottom, minV, maxV)

        data.series.forEachIndexed { s, (_, values) ->
            val color = Palette[s % Palette.size]
            val path = Path()
            values.forEachIndexed { i, v ->
                if (i == 0) path.moveTo(xAt(i), yAt(v)) else path.lineTo(xAt(i), yAt(v))
            }
            drawPath(path, color, style = Stroke(width = 3.dp.toPx()))
            values.forEachIndexed { i, v ->
                drawCircle(color, 5.dp.toPx(), Offset(xAt(i), yAt(v)))
            }
        }
        data.labels.forEachIndexed { i, label ->
            drawLabel(label.take(8), xAt(i), bottom + 16.dp.toPx())
        }
    }
}

/** A colored dot followed by a text label, one item per line. */
@Composable
fun Legend(items: List<Pair<String, Color>>) {
    Column(Modifier.padding(top = 8.dp)) {
        items.forEach { (label, color) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(vertical = 2.dp)
            ) {
                Box(Modifier.size(12.dp).background(color, CircleShape))
                Spacer(Modifier.width(8.dp))
                Text(label, fontSize = 13.sp)
            }
        }
    }
}

/** Picks the right chart for the type and adds its legend. */
@Composable
fun ChartView(type: ChartType, data: ChartData) {
    if (data.labels.isEmpty()) {
        Text("No data to chart.")
        return
    }
    when (type) {
        ChartType.BAR -> {
            BarChart(data)
            Legend(data.series.mapIndexed { i, s -> s.first to Palette[i % Palette.size] })
        }
        ChartType.PIE -> {
            PieChart(data)
            val values = data.series.first().second
            val total = values.sum().takeIf { it > 0 } ?: 1.0
            Legend(
                data.labels.mapIndexed { i, label ->
                    "$label: ${formatNum(values[i])} (${formatNum(values[i] / total * 100)}%)" to
                        Palette[i % Palette.size]
                }
            )
        }
        ChartType.LINE -> {
            LineChart(data)
            Legend(data.series.mapIndexed { i, s -> s.first to Palette[i % Palette.size] })
        }
    }
}

/** Shows a chart with its title and a short description. */
@Composable
fun ChartPreview(ds: Dataset, cfg: SavedChart) {
    val data = remember(ds, cfg) { buildChartData(ds, cfg.labelColumn, cfg.valueColumns) }
    Text(
        cfg.title,
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        modifier = Modifier.padding(top = 16.dp)
    )
    Text(
        "Type: ${cfg.type.name.lowercase()} · Categories: ${cfg.labelColumn} · Values: ${cfg.valueColumns.joinToString()}",
        fontSize = 12.sp,
        color = Color.Gray
    )
    ChartView(cfg.type, data)
}
