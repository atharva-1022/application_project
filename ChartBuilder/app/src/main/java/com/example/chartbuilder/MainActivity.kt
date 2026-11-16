package com.example.chartbuilder

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = Store(this)
        setContent {
            MaterialTheme { AppRoot(store) }
        }
    }
}

/** The screens of the app. */
sealed class Screen {
    object Home : Screen()
    object Manual : Screen()
    object Saved : Screen()
    data class DatasetView(val id: String) : Screen()
    data class ChartPage(val id: String) : Screen()
}

@Composable
fun AppRoot(store: Store) {
    val context = LocalContext.current
    var datasets by remember { mutableStateOf(store.loadDatasets()) }
    var charts by remember { mutableStateOf(store.loadCharts()) }
    var screen by remember { mutableStateOf<Screen>(Screen.Home) }

    // Android back button returns to Home from any other screen
    BackHandler(enabled = screen != Screen.Home) { screen = Screen.Home }

    val csvPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            val text = runCatching {
                context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            }.getOrNull()
            val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "Imported CSV"
            val ds = text?.let { parseCsv(fileName, it) }
            if (ds != null) {
                datasets = datasets + ds
                store.saveDatasets(datasets)
                screen = Screen.DatasetView(ds.id)
            } else {
                Toast.makeText(
                    context,
                    "Could not read this CSV. It needs a header row and at least one data row.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        when (val s = screen) {
            Screen.Home -> HomeScreen(
                datasets = datasets,
                savedCount = charts.size,
                onUpload = { csvPicker.launch(arrayOf("*/*")) },
                onManual = { screen = Screen.Manual },
                onSaved = { screen = Screen.Saved },
                onOpen = { screen = Screen.DatasetView(it) }
            )

            Screen.Manual -> ManualEntryScreen(
                onBack = { screen = Screen.Home },
                onSave = { ds ->
                    datasets = datasets + ds
                    store.saveDatasets(datasets)
                    screen = Screen.DatasetView(ds.id)
                }
            )

            Screen.Saved -> SavedChartsScreen(
                charts = charts,
                datasets = datasets,
                onBack = { screen = Screen.Home },
                onOpen = { screen = Screen.ChartPage(it) }
            )

            is Screen.DatasetView -> {
                val ds = datasets.find { it.id == s.id }
                if (ds == null) {
                    Header("Dataset not found", { screen = Screen.Home })
                } else {
                    DatasetScreen(
                        ds = ds,
                        onBack = { screen = Screen.Home },
                        onSaveChart = { chart ->
                            charts = charts + chart
                            store.saveCharts(charts)
                            screen = Screen.Saved
                        },
                        onDelete = {
                            datasets = datasets.filter { it.id != ds.id }
                            charts = charts.filter { it.datasetId != ds.id }
                            store.saveDatasets(datasets)
                            store.saveCharts(charts)
                            screen = Screen.Home
                        }
                    )
                }
            }

            is Screen.ChartPage -> {
                val chart = charts.find { it.id == s.id }
                val ds = chart?.let { c -> datasets.find { it.id == c.datasetId } }
                if (chart == null || ds == null) {
                    Header("Chart not found", { screen = Screen.Saved })
                } else {
                    ChartPageScreen(
                        chart = chart,
                        ds = ds,
                        onBack = { screen = Screen.Saved },
                        onDelete = {
                            charts = charts.filter { it.id != chart.id }
                            store.saveCharts(charts)
                            screen = Screen.Saved
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun Header(title: String, onBack: (() -> Unit)?) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        if (onBack != null) {
            TextButton(onClick = onBack) { Text("Back") }
        }
    }
    Spacer(Modifier.height(12.dp))
}

/** Filled button when selected, outlined when not. */
@Composable
fun Choice(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) {
        Button(onClick = onClick) { Text(label) }
    } else {
        OutlinedButton(onClick = onClick) { Text(label) }
    }
}

@Composable
fun HomeScreen(
    datasets: List<Dataset>,
    savedCount: Int,
    onUpload: () -> Unit,
    onManual: () -> Unit,
    onSaved: () -> Unit,
    onOpen: (String) -> Unit
) {
    Header("Chart Builder", null)
    Button(onClick = onUpload, modifier = Modifier.fillMaxWidth()) { Text("Upload CSV file") }
    Spacer(Modifier.height(8.dp))
    OutlinedButton(onClick = onManual, modifier = Modifier.fillMaxWidth()) { Text("Enter data manually") }
    Spacer(Modifier.height(8.dp))
    OutlinedButton(onClick = onSaved, modifier = Modifier.fillMaxWidth()) { Text("Saved charts ($savedCount)") }

    Spacer(Modifier.height(20.dp))
    Text("Your datasets", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
    if (datasets.isEmpty()) {
        Text("No datasets yet. Upload a CSV or enter data manually.", color = Color.Gray)
    }
    datasets.forEach { ds ->
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onOpen(ds.id) }) {
            Column(Modifier.padding(12.dp)) {
                Text(ds.name, fontWeight = FontWeight.SemiBold)
                Text(
                    "${ds.rows.size} rows · ${ds.columns.size} columns",
                    fontSize = 13.sp,
                    color = Color.Gray
                )
            }
        }
    }
}

@Composable
fun ManualEntryScreen(onBack: () -> Unit, onSave: (Dataset) -> Unit) {
    var name by remember { mutableStateOf("My data") }
    var colsText by remember { mutableStateOf("") }
    var columns by remember { mutableStateOf<List<String>>(emptyList()) }
    val rows = remember { mutableStateListOf<List<String>>() }
    var inputs by remember { mutableStateOf<List<String>>(emptyList()) }

    Header("Enter data manually", onBack)

    if (columns.isEmpty()) {
        // Step 1: name the dataset and its columns
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Dataset name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = colsText,
            onValueChange = { colsText = it },
            label = { Text("Column names, comma separated (e.g. Month, Sales, Cost)") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                val cols = colsText.split(",").map { it.trim() }.filter { it.isNotEmpty() }.distinct()
                if (cols.isNotEmpty()) {
                    columns = cols
                    inputs = List(cols.size) { "" }
                }
            },
            enabled = colsText.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Create table") }
    } else {
        // Step 2: show the table and add rows
        Text("Table: $name", fontWeight = FontWeight.SemiBold)
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
            Column(Modifier.padding(10.dp)) {
                Text(columns.joinToString("  |  "), fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                if (rows.isEmpty()) Text("No rows yet", color = Color.Gray)
                rows.forEach { row -> Text(row.joinToString("  |  ")) }
            }
        }

        Text("New row", fontWeight = FontWeight.SemiBold)
        columns.forEachIndexed { i, col ->
            OutlinedTextField(
                value = inputs[i],
                onValueChange = { v -> inputs = inputs.toMutableList().also { it[i] = v } },
                label = { Text(col) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)
            )
        }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = {
                rows.add(inputs.map { it.trim() })
                inputs = List(columns.size) { "" }
            },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Add row") }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = {
                onSave(Dataset(newId(), name.ifBlank { "Manual data" }, columns, rows.toList()))
            },
            enabled = rows.isNotEmpty(),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Save dataset") }
        TextButton(onClick = {
            columns = emptyList()
            rows.clear()
        }) { Text("Reset table") }
    }
}

@Composable
fun DatasetScreen(
    ds: Dataset,
    onBack: () -> Unit,
    onSaveChart: (SavedChart) -> Unit,
    onDelete: () -> Unit
) {
    val numericCols = ds.columns.filter { ds.isNumeric(it) }
    val categoricalCols = ds.columns.filter { it !in numericCols }

    var type by remember(ds.id) { mutableStateOf(ChartType.BAR) }
    var labelCol by remember(ds.id) {
        mutableStateOf(categoricalCols.firstOrNull() ?: ds.columns.first())
    }
    var selected by remember(ds.id) { mutableStateOf(numericCols.take(1).toSet()) }
    var title by remember(ds.id) { mutableStateOf("${ds.name} chart") }
    var shown by remember(ds.id) { mutableStateOf<SavedChart?>(null) }

    Header(ds.name, onBack)

    // Summary
    Text("Summary", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
    Text("Rows: ${ds.rows.size}     Columns: ${ds.columns.size}")
    Text(
        "Numeric: ${numericCols.ifEmpty { listOf("none") }.joinToString()}",
        fontSize = 13.sp
    )
    Text(
        "Categorical: ${categoricalCols.ifEmpty { listOf("none") }.joinToString()}",
        fontSize = 13.sp
    )
    numericCols.forEach { col ->
        ds.stats(col)?.let { (mn, mx, avg) ->
            Text(
                "$col → min ${formatNum(mn)}, max ${formatNum(mx)}, avg ${formatNum(avg)}",
                fontSize = 13.sp
            )
        }
    }

    // Chart builder
    Spacer(Modifier.height(20.dp))
    Text("Build a chart", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)

    Text("Chart type", fontSize = 13.sp, color = Color.Gray)
    Row(Modifier.horizontalScroll(rememberScrollState())) {
        ChartType.entries.forEach { t ->
            Choice(t.name.lowercase().replaceFirstChar { it.uppercase() }, type == t) { type = t }
            Spacer(Modifier.width(8.dp))
        }
    }

    Spacer(Modifier.height(8.dp))
    Text("Categories (X axis / slices)", fontSize = 13.sp, color = Color.Gray)
    Row(Modifier.horizontalScroll(rememberScrollState())) {
        ds.columns.forEach { col ->
            Choice(col, labelCol == col) { labelCol = col }
            Spacer(Modifier.width(8.dp))
        }
    }

    Spacer(Modifier.height(8.dp))
    Text("Values (numeric columns)", fontSize = 13.sp, color = Color.Gray)
    if (numericCols.isEmpty()) {
        Text("This dataset has no numeric columns to chart.", color = Color.Gray)
    }
    numericCols.forEach { col ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = col in selected,
                onCheckedChange = { on -> selected = if (on) selected + col else selected - col }
            )
            Text(col)
        }
    }

    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        value = title,
        onValueChange = { title = it },
        label = { Text("Chart title") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(Modifier.height(8.dp))
    Button(
        onClick = {
            shown = SavedChart(
                id = newId(),
                title = title.ifBlank { "Chart" },
                datasetId = ds.id,
                type = type,
                labelColumn = labelCol,
                valueColumns = numericCols.filter { it in selected }
            )
        },
        enabled = selected.isNotEmpty(),
        modifier = Modifier.fillMaxWidth()
    ) { Text("Show chart") }

    if (type == ChartType.PIE && selected.size > 1) {
        Text(
            "Pie charts use the first selected value column.",
            fontSize = 12.sp,
            color = Color.Gray
        )
    }

    shown?.let { cfg ->
        ChartPreview(ds, cfg)
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = { onSaveChart(cfg) }, modifier = Modifier.fillMaxWidth()) {
            Text("Save chart")
        }
    }

    Spacer(Modifier.height(24.dp))
    TextButton(onClick = onDelete) {
        Text("Delete dataset", color = MaterialTheme.colorScheme.error)
    }
}

@Composable
fun SavedChartsScreen(
    charts: List<SavedChart>,
    datasets: List<Dataset>,
    onBack: () -> Unit,
    onOpen: (String) -> Unit
) {
    Header("Saved charts", onBack)
    if (charts.isEmpty()) {
        Text("No saved charts yet. Open a dataset, build a chart and tap Save chart.", color = Color.Gray)
    }
    charts.forEach { c ->
        val dsName = datasets.find { it.id == c.datasetId }?.name ?: "Deleted dataset"
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onOpen(c.id) }) {
            Column(Modifier.padding(12.dp)) {
                Text(c.title, fontWeight = FontWeight.SemiBold)
                Text(
                    "${c.type.name.lowercase()} chart · $dsName",
                    fontSize = 13.sp,
                    color = Color.Gray
                )
            }
        }
    }
}

@Composable
fun ChartPageScreen(
    chart: SavedChart,
    ds: Dataset,
    onBack: () -> Unit,
    onDelete: () -> Unit
) {
    Header("Saved chart", onBack)
    ChartPreview(ds, chart)
    Spacer(Modifier.height(16.dp))
    TextButton(onClick = onDelete) {
        Text("Delete chart", color = MaterialTheme.colorScheme.error)
    }
}
