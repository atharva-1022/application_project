# Chart Builder (Android, Kotlin + Jetpack Compose)

An offline Android app to enter or import tabular data, look at a summary, and build bar, pie and line charts. All data is stored on the device. No account or server is needed.

## Features

- Enter a table manually (column names, then rows)
- Upload a CSV file (the first line must be the header)
- Columns are detected automatically as numeric or categorical
- Summary: row count, column count, and min / max / average for numeric columns
- Bar, pie and line charts with titles, axis labels, legends and colors
- Choose the category column, the value columns and the chart type
- Save charts and reopen them later
- Delete datasets or charts

## Requirements

- Android Studio Ladybug (2024.2) or newer
- JDK 17 (bundled with recent Android Studio versions)
- Android SDK 34 (Android Studio installs it for you)
- An Android phone with USB debugging on, or an emulator (Android 7.0 / API 24 or newer)

## Setup in Android Studio

Option A, the easiest way (recommended):
1. Open Android Studio, choose **New Project → Empty Activity** (Jetpack Compose), name it `ChartBuilder`, package `com.example.chartbuilder`, minimum SDK 24.
2. Replace the generated files with the files in this project:
   - `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`
   - `app/build.gradle.kts`
   - `app/src/main/AndroidManifest.xml`
   - All three `.kt` files in `app/src/main/java/com/example/chartbuilder/`
3. Click **Sync Project with Gradle Files**.
4. Click **Run ▶**, choose your device or emulator.

Option B: Open this folder directly with **File → Open**. If Android Studio asks to create the Gradle wrapper, accept it.

## Dependencies

All dependencies are declared in `app/build.gradle.kts`:

| Library | Purpose |
|---|---|
| Jetpack Compose (BOM 2024.09.00) | UI |
| Material 3 | Components and theme |
| activity-compose 1.9.2 | Compose host, file picker, back handling |
| core-ktx | Kotlin helpers |

Charts are drawn with Compose Canvas, so no extra chart library is needed. This avoids version conflicts. If you want a ready-made library, Vico (`com.patrykandpatrick.vico`) or MPAndroidChart can be added later.

## Try it

1. Copy `sample_data/sales_2026.csv` to your phone (or emulator Downloads folder).
2. In the app, tap **Upload CSV file** and pick it.
3. Tap **Bar**, select **Month** as the category, select **Revenue** and **Cost**, then tap **Show chart**.
4. Tap **Save chart**, then open **Saved charts** later to view it again.

## Project structure

```
ChartBuilder/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/com/example/chartbuilder/
│           ├── MainActivity.kt   # screens and navigation
│           ├── Charts.kt         # bar, pie, line charts and legends
│           └── Data.kt           # models, CSV parsing, stats, local storage
└── sample_data/sales_2026.csv
```

## Limitations

- CSV cells with line breaks inside quotes are not supported (each line is one row).
- Pie charts use only the first selected value column.
- Data is saved in the app's private storage. Uninstalling the app removes it.
