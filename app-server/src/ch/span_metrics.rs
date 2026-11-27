use anyhow::Result;
use clickhouse::Row;
use serde::Deserialize;
use uuid::Uuid;

/// One minute of the `span_metrics_1m` rollup for one model.
#[derive(Row, Deserialize, Debug, Clone, PartialEq)]
pub struct SpanMetricsMinute {
    /// Start of the minute, unix seconds.
    pub minute: u32,
    /// Empty for spans without a model, which is most non-LLM spans.
    pub model: String,
    /// Every span, of any type.
    pub span_count: u64,
    pub total_cost: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub llm_calls: u64,
    pub llm_errors: u64,
    /// LLM calls with zero cost.
    pub llm_calls_no_cost: u64,
    /// LLM calls with zero tokens.
    pub llm_calls_no_tokens: u64,
    /// LLM call durations: `LATENCY_BUCKET_BASE` log bucket to call count.
    pub llm_latency_buckets: Vec<(i16, u64)>,
}

/// Latency histogram buckets grow by 5%, so a quantile is off by at most 2.5%.
/// The materialized view computes the bucket with the same base.
pub const LATENCY_BUCKET_BASE: f64 = 1.05;

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
    // Unmerged parts hold several rows per key, so the aggregates are required.
    let query_str = format!(
        "SELECT toUnixTimestamp(minute) AS minute,
                toString(model) AS model,
                sum(span_count) AS span_count,
                sum(total_cost) AS total_cost,
                sum(input_tokens) AS input_tokens,
                sum(output_tokens) AS output_tokens,
                sum(total_tokens) AS total_tokens,
                sum(llm_calls) AS llm_calls,
                sum(llm_errors) AS llm_errors,
                sum(llm_calls_no_cost) AS llm_calls_no_cost,
                sum(llm_calls_no_tokens) AS llm_calls_no_tokens,
                sumMap(llm_latency_buckets) AS llm_latency_buckets
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
