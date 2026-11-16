package com.example.chartbuilder

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

enum class ChartType { BAR, PIE, LINE }

fun newId(): String = UUID.randomUUID().toString()

fun formatNum(v: Double): String =
    if (v % 1.0 == 0.0) v.toLong().toString() else String.format(Locale.US, "%.2f", v)

/** A table of data. Every value is stored as text; numeric columns are detected automatically. */
data class Dataset(
    val id: String,
    val name: String,
    val columns: List<String>,
    val rows: List<List<String>>
) {
    fun colIndex(col: String): Int = columns.indexOf(col)

    fun cell(row: List<String>, col: String): String =
        row.getOrNull(colIndex(col))?.trim().orEmpty()

    /** A column is numeric when every non-empty value parses as a number. */
    fun isNumeric(col: String): Boolean {
        val values = rows.map { cell(it, col) }.filter { it.isNotEmpty() }
        return values.isNotEmpty() && values.all { it.toDoubleOrNull() != null }
    }

    fun numericValues(col: String): List<Double> =
        rows.mapNotNull { cell(it, col).toDoubleOrNull() }

    /** Returns (min, max, average) or null if the column has no numbers. */
    fun stats(col: String): Triple<Double, Double, Double>? {
        val v = numericValues(col)
        return if (v.isEmpty()) null else Triple(v.min(), v.max(), v.average())
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("name", name)
        put("columns", JSONArray(columns))
        put("rows", JSONArray().apply { rows.forEach { put(JSONArray(it)) } })
    }

    companion object {
        fun fromJson(o: JSONObject): Dataset {
            val cols = o.getJSONArray("columns").let { a -> List(a.length()) { a.getString(it) } }
            val ra = o.getJSONArray("rows")
            val rows = List(ra.length()) { r ->
                val a = ra.getJSONArray(r)
                List(a.length()) { a.getString(it) }
            }
            return Dataset(o.getString("id"), o.getString("name"), cols, rows)
        }
    }
}

/** A chart the user built and chose to keep. */
data class SavedChart(
    val id: String,
    val title: String,
    val datasetId: String,
    val type: ChartType,
    val labelColumn: String,
    val valueColumns: List<String>
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("title", title)
        put("datasetId", datasetId)
        put("type", type.name)
        put("labelColumn", labelColumn)
        put("valueColumns", JSONArray(valueColumns))
    }

    companion object {
        fun fromJson(o: JSONObject) = SavedChart(
            id = o.getString("id"),
            title = o.getString("title"),
            datasetId = o.getString("datasetId"),
            type = ChartType.valueOf(o.getString("type")),
            labelColumn = o.getString("labelColumn"),
            valueColumns = o.getJSONArray("valueColumns").let { a ->
                List(a.length()) { a.getString(it) }
            }
        )
    }
}

/** Ready-to-draw data: category labels and one or more named series. */
data class ChartData(val labels: List<String>, val series: List<Pair<String, List<Double>>>)

/** Parses CSV text. The first line is the header. Returns null if there is no data. */
fun parseCsv(name: String, text: String): Dataset? {
    val lines = text.removePrefix("\uFEFF").lines().filter { it.isNotBlank() }
    if (lines.size < 2) return null
    val header = splitCsvLine(lines.first()).map { it.ifBlank { "Column" } }
    val rows = lines.drop(1).map { line ->
        val cells = splitCsvLine(line)
        List(header.size) { cells.getOrNull(it).orEmpty() }
    }
    return Dataset(newId(), name, header, rows)
}

/** Splits one CSV line, supporting quoted fields such as "Hello, World". */
fun splitCsvLine(line: String): List<String> {
    val out = mutableListOf<String>()
    val sb = StringBuilder()
    var inQuotes = false
    var i = 0
    while (i < line.length) {
        val c = line[i]
        when {
            c == '"' && inQuotes && i + 1 < line.length && line[i + 1] == '"' -> {
                sb.append('"'); i++
            }
            c == '"' -> inQuotes = !inQuotes
            c == ',' && !inQuotes -> {
                out.add(sb.toString().trim()); sb.clear()
            }
            else -> sb.append(c)
        }
        i++
    }
    out.add(sb.toString().trim())
    return out
}

/**
 * Groups rows by the label column and sums each value column.
 * Labels keep the order in which they first appear.
 */
fun buildChartData(ds: Dataset, labelCol: String, valueCols: List<String>): ChartData {
    val groups = LinkedHashMap<String, DoubleArray>()
    val n = valueCols.size
    ds.rows.forEach { row ->
        val label = ds.cell(row, labelCol).ifEmpty { "(blank)" }
        val acc = groups.getOrPut(label) { DoubleArray(n) }
        valueCols.forEachIndexed { k, col ->
            acc[k] += ds.cell(row, col).toDoubleOrNull() ?: 0.0
        }
    }
    return ChartData(
        labels = groups.keys.toList(),
        series = valueCols.mapIndexed { k, col -> col to groups.values.map { it[k] } }
    )
}

/** Saves datasets and charts locally on the device using SharedPreferences. No server needed. */
class Store(context: Context) {
    private val prefs = context.getSharedPreferences("chart_builder", Context.MODE_PRIVATE)

    fun loadDatasets(): List<Dataset> = readArray("datasets") { Dataset.fromJson(it) }

    fun saveDatasets(list: List<Dataset>) = writeArray("datasets", list.map { it.toJson() })

    fun loadCharts(): List<SavedChart> = readArray("charts") { SavedChart.fromJson(it) }

    fun saveCharts(list: List<SavedChart>) = writeArray("charts", list.map { it.toJson() })

    private fun <T> readArray(key: String, parse: (JSONObject) -> T): List<T> {
        val arr = JSONArray(prefs.getString(key, "[]") ?: "[]")
        return List(arr.length()) { parse(arr.getJSONObject(it)) }
    }

    private fun writeArray(key: String, items: List<JSONObject>) {
        prefs.edit().putString(key, JSONArray(items).toString()).apply()
    }
}
