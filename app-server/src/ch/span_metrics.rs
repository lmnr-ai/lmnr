use anyhow::Result;
use clickhouse::Row;
use serde::Deserialize;
use uuid::Uuid;

/// One minute of the `span_metrics_1m` rollup for one model.
#[derive(Row, Deserialize, Debug, Clone, PartialEq)]
pub struct SpanMetricsMinute {
    /// Start of the minute, unix seconds.
    pub minute: u32,
    pub model: String,
    pub total_cost: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub llm_calls: u64,
    /// LLM calls with zero cost.
    pub llm_calls_no_cost: u64,
    /// LLM calls with zero tokens.
    pub llm_calls_no_tokens: u64,
}

/// Half-open range of minutes, unix seconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MinuteRange {
    pub start: i64,
    pub end: i64,
}

/// Reads the rollup for one project in a single scan over all `ranges`.
/// Minutes without spans are absent from the result.
pub async fn get_span_metrics(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    ranges: &[MinuteRange],
) -> Result<Vec<SpanMetricsMinute>> {
    if ranges.is_empty() {
        return Ok(vec![]);
    }

    let range_predicates =
        vec!["(minute >= toDateTime(?, 'UTC') AND minute < toDateTime(?, 'UTC'))"; ranges.len()]
            .join(" OR ");
    // Unmerged parts hold several rows per key, so the sums are required.
    let query_str = format!(
        "SELECT toUnixTimestamp(minute) AS minute,
                toString(model) AS model,
                sum(total_cost) AS total_cost,
                sum(input_tokens) AS input_tokens,
                sum(output_tokens) AS output_tokens,
                sum(total_tokens) AS total_tokens,
                sum(llm_calls) AS llm_calls,
                sum(llm_calls_no_cost) AS llm_calls_no_cost,
                sum(llm_calls_no_tokens) AS llm_calls_no_tokens
         FROM span_metrics_1m
         WHERE project_id = ? AND ({range_predicates})
         GROUP BY minute, model
         ORDER BY minute, model"
    );

    let mut query = clickhouse.query(&query_str).bind(project_id);
    for range in ranges {
        query = query.bind(range.start).bind(range.end);
    }

    Ok(query.fetch_all::<SpanMetricsMinute>().await?)
}
