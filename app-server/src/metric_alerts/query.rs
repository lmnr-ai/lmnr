//! ClickHouse reads for metric rules. Every due rule of a project shares one
//! scan of the span rollup, and rules with the same trace filters share one
//! scan of the traces.

use std::collections::HashMap;

use anyhow::Result;
use clickhouse::{Row, query::Query};
use serde::Deserialize;
use uuid::Uuid;

use crate::ch::span_metrics::{MinuteRange, get_span_metrics};

use super::{
    filters::{Bind, FilterSql, build_where},
    rule::{Filter, Metric, Rule},
    series::{LATENCY_BUCKET_BASE, Minutes, Series, merge_ranges, reads_spans, reads_traces},
};

/// A trace is found by its start time, so a trace that started longer than
/// this before the window is not counted.
const TRACE_LOOKBACK_MINUTES: i64 = 60;
/// Single-trace cost rules exist to catch long runaway traces.
const TRACE_COST_LOOKBACK_MINUTES: i64 = 24 * 60;

/// Traces whose last span so far ended in `minute`, per latency bucket.
#[derive(Row, Deserialize, Debug, Clone, PartialEq)]
pub struct TraceMinute {
    /// Start of the minute, unix seconds.
    pub minute: u32,
    pub bucket: i32,
    pub traces: u64,
    pub error_traces: u64,
    pub no_cost_traces: u64,
    pub no_tokens_traces: u64,
    pub total_cost: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub max_cost: f64,
}

const TRACES_AGG_SOURCE: &str = "
    SELECT min(start_time) AS trace_start,
           max(end_time) AS trace_end,
           sum(total_cost) AS trace_cost,
           sum(input_tokens) AS trace_input_tokens,
           sum(output_tokens) AS trace_output_tokens,
           sum(total_tokens) AS trace_total_tokens,
           has(groupUniqArrayArray(statuses), 'error') AS is_error
    FROM traces_agg
    WHERE project_id = ?
      AND start_time >= fromUnixTimestamp(?) AND start_time < fromUnixTimestamp(?)
    GROUP BY id
    HAVING NOT hasAny(groupUniqArrayArray(trace_types), ['EVALUATION', 'PLAYGROUND'])";

const TRACES_VIEW_SOURCE: &str = "
    SELECT start_time AS trace_start,
           end_time AS trace_end,
           total_cost AS trace_cost,
           input_tokens AS trace_input_tokens,
           output_tokens AS trace_output_tokens,
           total_tokens AS trace_total_tokens,
           status = 'error' AS is_error
    FROM traces_v0(
        project_id = ?,
        min_start_time = toDateTime64(fromUnixTimestamp(?), 9),
        max_start_time = toDateTime64(fromUnixTimestamp(?), 9) - toIntervalNanosecond(1)
    )";

const PRODUCTION_ONLY: &str = "trace_type NOT IN ('EVALUATION', 'PLAYGROUND')";

/// The rule's trace predicate. Rules watch production traffic: evaluation and
/// playground traces are left out unless the rule filters on the trace type
/// itself. With no filters the predicate is empty and `TRACES_AGG_SOURCE`
/// leaves them out.
fn trace_filter(filters: &[Filter]) -> Result<FilterSql> {
    let mut filter = build_where(filters).map_err(anyhow::Error::msg)?;
    let picks_trace_type = filters.iter().any(|f| f.column == "trace_type");
    if !filter.sql.is_empty() && !picks_trace_type {
        filter.sql = format!("{PRODUCTION_ONLY} AND ({})", filter.sql);
    }
    Ok(filter)
}

/// One subquery per range, each returning one row per trace. Unfiltered rules
/// read `traces_agg` directly, which skips the joins the view needs for
/// filtering.
fn traces_source(filter: &FilterSql, ranges: usize) -> String {
    let one = if filter.sql.is_empty() {
        TRACES_AGG_SOURCE.to_string()
    } else {
        format!("{TRACES_VIEW_SOURCE} WHERE {}", filter.sql)
    };
    vec![one; ranges].join("\nUNION ALL\n")
}

fn bind_traces_source(
    mut query: Query,
    project_id: &Uuid,
    filter: &FilterSql,
    ranges: &[Minutes],
) -> Query {
    for range in ranges {
        query = query
            .bind(project_id)
            .bind(range.start * 60)
            .bind(range.end * 60);
        for bind in &filter.binds {
            query = match bind {
                Bind::Text(value) => query.bind(value),
                Bind::Float(value) => query.bind(value),
                Bind::Int(value) => query.bind(value),
            };
        }
    }
    query
}

fn with_lookback(ranges: &[Minutes], lookback: i64) -> Vec<Minutes> {
    let extended = ranges
        .iter()
        .map(|range| Minutes {
            start: range.start - lookback,
            end: range.end,
        })
        .collect();
    merge_ranges(extended)
}

/// What a group of rules with the same filters needs from the traces.
#[derive(Debug, Clone, Default)]
struct TraceRead {
    filter: FilterSql,
    ranges: Vec<Minutes>,
    lookback: i64,
    latency: bool,
}

async fn get_trace_minutes(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    read: &TraceRead,
) -> Result<Vec<TraceMinute>> {
    let ranges = merge_ranges(read.ranges.clone());
    if ranges.is_empty() {
        return Ok(vec![]);
    }
    let scans = with_lookback(&ranges, read.lookback);
    let bucket = if read.latency {
        format!(
            "toInt32(floor(log(greatest(dateDiff('millisecond', trace_start, trace_end), 1)) \
             / log({LATENCY_BUCKET_BASE})))"
        )
    } else {
        "toInt32(0)".to_string()
    };
    let ended_in_range = vec![
        "(trace_end >= fromUnixTimestamp(?) AND trace_end < fromUnixTimestamp(?))";
        ranges.len()
    ]
    .join(" OR ");
    let query_str = format!(
        "SELECT toUnixTimestamp(toStartOfMinute(trace_end)) AS minute,
                {bucket} AS bucket,
                count() AS traces,
                countIf(is_error) AS error_traces,
                countIf(trace_cost = 0) AS no_cost_traces,
                countIf(trace_total_tokens = 0) AS no_tokens_traces,
                sum(trace_cost) AS total_cost,
                sum(trace_input_tokens) AS input_tokens,
                sum(trace_output_tokens) AS output_tokens,
                sum(trace_total_tokens) AS total_tokens,
                max(trace_cost) AS max_cost
         FROM ({source})
         WHERE {ended_in_range}
         GROUP BY minute, bucket
         ORDER BY minute, bucket",
        source = traces_source(&read.filter, scans.len()),
    );

    let mut query = clickhouse.query(&query_str);
    query = bind_traces_source(query, project_id, &read.filter, &scans);
    for range in &ranges {
        query = query.bind(range.start * 60).bind(range.end * 60);
    }

    Ok(query.fetch_all::<TraceMinute>().await?)
}

/// The p99 cost of one trace among those matching the rule's filters.
/// `None` when the range has no traces.
pub async fn get_trace_cost_p99(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    rule: &Rule,
    range: Minutes,
) -> Result<Option<f64>> {
    let filter = trace_filter(&rule.filters)?;
    let query_str = format!(
        "SELECT if(count() = 0, NULL, quantile(0.99)(trace_cost)) FROM ({})",
        traces_source(&filter, 1)
    );
    let query = bind_traces_source(clickhouse.query(&query_str), project_id, &filter, &[range]);

    Ok(query.fetch_one::<Option<f64>>().await?)
}

/// A rule and the minutes at which it is checked.
pub struct RuleChecks<'a> {
    pub rule: &'a Rule,
    pub ranges: Vec<Minutes>,
}

/// Reads everything `checks` need and returns one series per rule, in order.
pub async fn fetch_series(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    checks: &[RuleChecks<'_>],
) -> Result<Vec<Series>> {
    let mut span_ranges = Vec::new();
    // Keyed by the predicate, so rules with equal filters share a scan.
    let mut trace_reads: HashMap<String, TraceRead> = HashMap::new();
    let mut trace_keys = Vec::with_capacity(checks.len());

    for check in checks {
        if reads_spans(check.rule) {
            span_ranges.extend(check.ranges.iter().copied());
        }
        if !reads_traces(check.rule) {
            trace_keys.push(None);
            continue;
        }
        let filter = trace_filter(&check.rule.filters)?;
        let key = format!("{}|{:?}", filter.sql, filter.binds);
        let read = trace_reads.entry(key.clone()).or_insert_with(|| TraceRead {
            filter,
            ..Default::default()
        });
        read.ranges.extend(check.ranges.iter().copied());
        read.latency |= check.rule.metric.is_latency();
        read.lookback = read.lookback.max(match check.rule.metric {
            Metric::TraceCost => TRACE_COST_LOOKBACK_MINUTES,
            _ => TRACE_LOOKBACK_MINUTES,
        });
        trace_keys.push(Some(key));
    }

    let span_ranges: Vec<MinuteRange> = merge_ranges(span_ranges)
        .into_iter()
        .map(|range| MinuteRange {
            start: range.start * 60,
            end: range.end * 60,
        })
        .collect();
    let span_rows = get_span_metrics(clickhouse, project_id, &span_ranges).await?;

    let mut trace_rows = HashMap::with_capacity(trace_reads.len());
    for (key, read) in &trace_reads {
        let rows = get_trace_minutes(clickhouse, project_id, read).await?;
        trace_rows.insert(key.as_str(), rows);
    }

    let series = checks
        .iter()
        .zip(&trace_keys)
        .map(|(check, trace_key)| {
            let mut series = Series::default();
            if reads_spans(check.rule) {
                series.add_span_rows(&span_rows);
            }
            if let Some(rows) = trace_key
                .as_ref()
                .and_then(|key| trace_rows.get(key.as_str()))
            {
                series.add_trace_rows(rows);
            }
            series
        })
        .collect();

    Ok(series)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn filter(column: &str, value: &str) -> Filter {
        Filter {
            column: column.to_string(),
            operator: "eq".to_string(),
            value: json!(value),
        }
    }

    #[test]
    fn rules_watch_production_traffic_unless_they_pick_a_trace_type() {
        let unfiltered = trace_filter(&[]).unwrap();
        assert!(unfiltered.sql.is_empty());
        let source = traces_source(&unfiltered, 1);
        assert!(source.contains("FROM traces_agg") && source.contains("'PLAYGROUND'"));

        let by_user = trace_filter(&[filter("user_id", "u1")]).unwrap();
        assert!(by_user.sql.starts_with(PRODUCTION_ONLY), "{}", by_user.sql);
        assert!(traces_source(&by_user, 1).contains("FROM traces_v0"));

        let evals = [filter("trace_type", "EVALUATION"), filter("user_id", "u1")];
        let evals = trace_filter(&evals).unwrap();
        assert!(!evals.sql.contains(PRODUCTION_ONLY), "{}", evals.sql);
    }
}
