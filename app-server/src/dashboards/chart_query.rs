//! Raw-SQL chart writes from the CLI: each query is checked against the parameters a dashboard
//! binds and test-run before anything is saved. Charts carry no `queryStructure`, like a
//! SQL-editor export. Mirrors the Laminar agent's `upsert_chart` tool.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::{Arc, LazyLock};

use chrono::{DateTime, Duration, Utc};
use futures_util::future::try_join_all;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use super::{ChartUpsert, DashboardError, layout::Layout};
use crate::access_policy::AccessPolicy;
use crate::cache::Cache;
use crate::db::DB;
use crate::query_engine::QueryEngine;
use crate::sql::{self, ClickhouseReadonlyClient, SqlQuerySource};

pub const MAX_CHARTS_PER_CALL: usize = 30;

/// The parameters a dashboard binds when it renders a chart (`components/dashboards/chart.tsx` →
/// `convertToTimeParameters`). A chart query may use no others.
const START_TIME: &str = "start_time";
const END_TIME: &str = "end_time";
const INTERVAL_UNIT: &str = "interval_unit";
const DASHBOARD_PARAMS: [(&str, &str); 3] = [
    (START_TIME, "DateTime64"),
    (END_TIME, "DateTime64"),
    (INTERVAL_UNIT, "String"),
];

static PARAM_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^{}]*?)\s*\}").expect("valid regex")
});

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ChartType {
    Line,
    Bar,
    HorizontalBar,
    Table,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DisplayMode {
    Total,
    Average,
    None,
}

/// The subset of the frontend's `ChartConfig` a raw-SQL chart sets.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartConfig {
    pub r#type: ChartType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub breakdown: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_mode: Option<DisplayMode>,
}

/// One chart to create (no `id`: name, query and config required) or patch (`id`: omitted fields
/// are kept). `query` and `config` travel together so the pair is always re-checked.
#[derive(Debug, Deserialize)]
pub struct ChartInput {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub config: Option<ChartConfig>,
    #[serde(default)]
    pub layout: Option<Layout>,
}

/// What a test run needs. The policy is the caller's, so a chart can't be checked against rows
/// its author can't read.
pub struct QueryRunner {
    pub project_id: Uuid,
    pub policy: AccessPolicy,
    pub clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    pub query_engine: Arc<QueryEngine>,
    pub http_client: Arc<reqwest::Client>,
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
}

pub struct CheckedCharts {
    pub upserts: Vec<ChartUpsert>,
    /// Caveats that did not block the write, e.g. a query with no rows to check the axes against.
    pub warnings: Vec<String>,
}

struct CheckedChart {
    upsert: ChartUpsert,
    warning: Option<String>,
}

/// Checks every entry (test-running changed queries in parallel); any failure rejects the batch.
pub async fn check_charts(
    charts: Vec<ChartInput>,
    runner: &QueryRunner,
) -> Result<CheckedCharts, DashboardError> {
    if charts.len() > MAX_CHARTS_PER_CALL {
        return Err(DashboardError::Validation(format!(
            "At most {MAX_CHARTS_PER_CALL} charts per call"
        )));
    }
    let checked = try_join_all(
        charts
            .into_iter()
            .enumerate()
            .map(|(i, chart)| check_chart(i, chart, runner)),
    )
    .await?;

    let warnings = checked.iter().filter_map(|c| c.warning.clone()).collect();
    let upserts = checked.into_iter().map(|c| c.upsert).collect();
    Ok(CheckedCharts { upserts, warnings })
}

/// Name/layout-only updates pass through; a changed query is checked and test-run.
async fn check_chart(
    index: usize,
    chart: ChartInput,
    runner: &QueryRunner,
) -> Result<CheckedChart, DashboardError> {
    let invalid = |msg: String| DashboardError::Validation(format!("charts[{index}]: {msg}"));
    let (content, warning) = match (chart.query, chart.config) {
        (Some(query), Some(config)) => {
            let (query, warning) = check_chart_query(query, &config, runner)
                .await
                .map_err(invalid)?;
            let config = serde_json::to_value(config).map_err(anyhow::Error::from)?;
            (
                Some((query, config)),
                warning.map(|w| format!("charts[{index}]: {w}")),
            )
        }
        (None, None) => (None, None),
        _ => {
            return Err(invalid(
                "query and config must be given together".to_string(),
            ));
        }
    };

    let (query, config) = content.unzip();
    Ok(CheckedChart {
        upsert: ChartUpsert {
            id: chart.id,
            name: chart.name,
            query,
            query_structure: None,
            config,
            layout: chart.layout,
        },
        warning,
    })
}

/// Returns the query as it will be stored, and a warning when the mappings could not be checked.
async fn check_chart_query(
    query: String,
    config: &ChartConfig,
    runner: &QueryRunner,
) -> Result<(String, Option<String>), String> {
    let query = query.trim().trim_end_matches(';').trim_end().to_string();
    check_axes(config)?;
    check_parameters(&query, config)?;

    let test_query = match config.r#type {
        ChartType::Table => first_table_page(&query),
        _ => query.clone(),
    };
    let rows = sql::execute_sql_query(
        test_query,
        runner.project_id,
        test_parameters(Utc::now()),
        SqlQuerySource::Public,
        runner.policy.clone(),
        runner.clickhouse_ro.clone(),
        runner.query_engine.clone(),
        runner.http_client.clone(),
        runner.db.clone(),
        runner.cache.clone(),
    )
    .await
    .map_err(|e| format!("query failed when run over the last 24h: {}", e.message()))?;

    let warning = match rows.first() {
        Some(Value::Object(row)) => {
            check_mappings(config, &row.keys().map(String::as_str).collect())?;
            check_breakdown(config, &rows)?;
            None
        }
        _ => Some(
            "the query returned no rows over the last 24h, so x/y/breakdown were not checked against its columns"
                .to_string(),
        ),
    };
    Ok((query, warning))
}

/// The first page a dashboard fetches for a table chart.
fn first_table_page(query: &str) -> String {
    format!("SELECT * FROM ({query}\n) LIMIT 51 OFFSET 0")
}

/// Only the dashboard's own parameters, with the types it binds; both time bounds are required.
/// Line/bar charts plotted over `time` must bucket by the dashboard's interval.
fn check_parameters(query: &str, config: &ChartConfig) -> Result<(), String> {
    let mut used = BTreeSet::new();
    for capture in PARAM_RE.captures_iter(query) {
        let (name, ty) = (&capture[1], &capture[2]);
        match DASHBOARD_PARAMS.iter().find(|(param, _)| *param == name) {
            Some((_, expected)) if *expected == ty => {
                used.insert(name.to_string());
            }
            Some((_, expected)) => {
                return Err(format!(
                    "parameter `{{{name}:{ty}}}` must be written `{{{name}:{expected}}}`"
                ));
            }
            None => {
                return Err(format!(
                    "unknown parameter `{{{name}:{ty}}}`; a dashboard only binds {{start_time:DateTime64}}, {{end_time:DateTime64}} and {{interval_unit:String}}"
                ));
            }
        }
    }

    for required in [START_TIME, END_TIME] {
        if !used.contains(required) {
            return Err(format!(
                "the query must filter its time column with `{{{START_TIME}:DateTime64}}` and `{{{END_TIME}:DateTime64}}` so the chart follows the dashboard's time picker"
            ));
        }
    }
    let over_time = matches!(config.r#type, ChartType::Line | ChartType::Bar)
        && config.x.as_deref() == Some("time");
    if over_time && !used.contains(INTERVAL_UNIT) {
        return Err(format!(
            "a line/bar chart over `time` must bucket with `toStartOfInterval(<time column>, toInterval(1, {{{INTERVAL_UNIT}:String}}))` so it follows the dashboard's interval"
        ));
    }
    Ok(())
}

/// Values in the exact shape `convertToTimeParameters` sends: UTC `YYYY-MM-DD HH:MM:SS.mmm`.
fn test_parameters(now: DateTime<Utc>) -> HashMap<String, Value> {
    let format = |t: DateTime<Utc>| t.format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    HashMap::from([
        (
            START_TIME.to_string(),
            json!(format(now - Duration::hours(24))),
        ),
        (END_TIME.to_string(), json!(format(now))),
        (INTERVAL_UNIT.to_string(), json!("HOUR")),
    ])
}

fn check_mappings(config: &ChartConfig, columns: &BTreeSet<&str>) -> Result<(), String> {
    let mapped = [
        ("x", &config.x),
        ("y", &config.y),
        ("breakdown", &config.breakdown),
    ];
    for (field, column) in mapped {
        if let Some(column) = column
            && !columns.contains(column.as_str())
        {
            return Err(format!(
                "`config.{field}` is `{column}`, but the query returns only: {}",
                columns.iter().copied().collect::<Vec<_>>().join(", ")
            ));
        }
    }
    Ok(())
}

/// Checked before the test run, so an empty 24h window can't let a chart through without axes.
fn check_axes(config: &ChartConfig) -> Result<(), String> {
    if config.r#type != ChartType::Table && (config.x.is_none() || config.y.is_none()) {
        return Err(
            "`config.x` and `config.y` are required for line, bar and horizontalBar charts"
                .to_string(),
        );
    }
    Ok(())
}

/// Line/bar rows that repeat an x value come from a query that also groups by another column.
/// Without a breakdown the chart draws them as one series zig-zagging between the groups.
fn check_breakdown(config: &ChartConfig, rows: &[Value]) -> Result<(), String> {
    let (ChartType::Line | ChartType::Bar, None, Some(x)) =
        (&config.r#type, &config.breakdown, &config.x)
    else {
        return Ok(());
    };
    let mut seen = HashSet::new();
    let repeats_x = rows
        .iter()
        .filter_map(|row| row.get(x))
        .any(|value| !seen.insert(value.to_string()));
    if !repeats_x {
        return Ok(());
    }

    let candidates = rows
        .first()
        .and_then(Value::as_object)
        .map(|row| {
            row.iter()
                .filter(|(name, value)| {
                    name.as_str() != x
                        && Some(name.as_str()) != config.y.as_deref()
                        && value.is_string()
                })
                .map(|(name, _)| name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    Err(format!(
        "several rows share the same `{x}` value, so the query also groups by another column. Set `config.breakdown` to that column to draw one series per value (candidates: {candidates}), or remove it from GROUP BY"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(t: ChartType, x: Option<&str>, y: Option<&str>) -> ChartConfig {
        ChartConfig {
            r#type: t,
            x: x.map(str::to_string),
            y: y.map(str::to_string),
            breakdown: None,
            display_mode: None,
        }
    }

    const TIME_SERIES: &str = "SELECT toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time, count() AS n \
        FROM spans WHERE start_time >= {start_time:DateTime64} AND start_time <= {end_time:DateTime64} GROUP BY time";

    #[test]
    fn accepts_dashboard_parameters() {
        let line = config(ChartType::Line, Some("time"), Some("n"));
        assert!(check_parameters(TIME_SERIES, &line).is_ok());
        let spaced = "SELECT count() AS n FROM spans WHERE start_time >= { start_time : DateTime64 } AND start_time <= {end_time:DateTime64}";
        assert!(check_parameters(spaced, &config(ChartType::Table, None, None)).is_ok());
    }

    #[test]
    fn rejects_missing_time_bounds() {
        let q = "SELECT count() AS n FROM spans WHERE start_time >= {start_time:DateTime64}";
        let err = check_parameters(q, &config(ChartType::Table, None, None)).unwrap_err();
        assert!(err.contains("end_time"));
        let q = "SELECT count() AS n FROM spans WHERE start_time > now() - INTERVAL 1 DAY";
        assert!(check_parameters(q, &config(ChartType::Table, None, None)).is_err());
    }

    #[test]
    fn rejects_wrong_type_and_unknown_parameters() {
        let q = "SELECT 1 FROM spans WHERE start_time >= {start_time:DateTime} AND start_time <= {end_time:DateTime64}";
        let err = check_parameters(q, &config(ChartType::Table, None, None)).unwrap_err();
        assert!(err.contains("{start_time:DateTime64}"));
        let q = "SELECT 1 FROM spans WHERE start_time >= {start_time:DateTime64} AND start_time <= {end_time:DateTime64} AND name = {span:String}";
        assert!(check_parameters(q, &config(ChartType::Table, None, None)).is_err());
    }

    #[test]
    fn time_series_needs_interval() {
        let q = "SELECT toStartOfHour(start_time) AS time, count() AS n FROM spans \
            WHERE start_time >= {start_time:DateTime64} AND start_time <= {end_time:DateTime64} GROUP BY time";
        let line = config(ChartType::Line, Some("time"), Some("n"));
        assert!(
            check_parameters(q, &line)
                .unwrap_err()
                .contains("interval_unit")
        );
        // A category bar chart has no time axis to bucket.
        let bar = config(ChartType::Bar, Some("model"), Some("n"));
        assert!(check_parameters(q, &bar).is_ok());
    }

    #[test]
    fn test_parameters_match_frontend_format() {
        let now = DateTime::parse_from_rfc3339("2026-10-22T12:30:45.123Z")
            .unwrap()
            .with_timezone(&Utc);
        let params = test_parameters(now);
        assert_eq!(params[START_TIME], json!("2026-10-21 12:30:45.123"));
        assert_eq!(params[END_TIME], json!("2026-10-22 12:30:45.123"));
        assert_eq!(params[INTERVAL_UNIT], json!("HOUR"));
    }

    #[test]
    fn mappings_must_name_result_columns() {
        let columns: BTreeSet<&str> = ["time", "n"].into();
        assert!(
            check_mappings(&config(ChartType::Line, Some("time"), Some("n")), &columns).is_ok()
        );
        let err = check_mappings(
            &config(ChartType::Line, Some("time"), Some("count")),
            &columns,
        )
        .unwrap_err();
        assert!(err.contains("returns only: n, time"));
        assert!(check_mappings(&config(ChartType::Table, None, None), &columns).is_ok());
    }

    #[test]
    fn axes_are_required_except_for_tables() {
        assert!(check_axes(&config(ChartType::Line, Some("time"), Some("n"))).is_ok());
        assert!(check_axes(&config(ChartType::Line, Some("time"), None)).is_err());
        assert!(check_axes(&config(ChartType::HorizontalBar, None, Some("name"))).is_err());
        assert!(check_axes(&config(ChartType::Table, None, None)).is_ok());
    }

    #[test]
    fn grouped_rows_need_a_breakdown() {
        let rows = vec![
            json!({"time": "10:00", "status": "success", "n": 12}),
            json!({"time": "10:00", "status": "error", "n": 3}),
        ];
        let line = config(ChartType::Line, Some("time"), Some("n"));
        let err = check_breakdown(&line, &rows).unwrap_err();
        assert!(err.contains("candidates: status"));

        let with_breakdown = ChartConfig {
            breakdown: Some("status".to_string()),
            ..line.clone()
        };
        assert!(check_breakdown(&with_breakdown, &rows).is_ok());
        // One row per x value is a single series; horizontal bars never split.
        assert!(check_breakdown(&line, &rows[..1]).is_ok());
        let horizontal = config(ChartType::HorizontalBar, Some("n"), Some("status"));
        assert!(check_breakdown(&horizontal, &rows).is_ok());
    }
}
