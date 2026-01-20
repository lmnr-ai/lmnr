// TODO: verify implementation, use ch/spans.rs [?]

use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

/// Full span info returned by get_full_span_info tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanInfo {
    pub id: usize,
    pub name: String,
    #[serde(rename = "type")]
    pub span_type: String,
    pub start: String,
    pub end: String,
    pub status: String,
    pub input: Value,
    pub output: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exception: Option<Value>,
}

/// Minimal struct for querying spans with exception data
#[derive(Debug, Clone, Row, Serialize, Deserialize)]
pub struct CHSpanWithException {
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub parent_span_id: Uuid,
    pub name: String,
    pub span_type: u8,
    pub start_time: i64,
    pub end_time: i64,
    pub input: String,
    pub output: String,
    pub status: String,
    pub exception: String,
}

fn get_span_type_str(span_type: u8) -> String {
    match span_type {
        1 => "llm",
        6 => "tool",
        _ => "default",
    }
    .to_string()
}

/// Try to parse a string as JSON, fallback to wrapping as JSON string
fn try_parse_json(s: &str) -> Value {
    if s.is_empty() {
        return Value::Null;
    }
    serde_json::from_str(s).unwrap_or_else(|_| Value::String(s.to_string()))
}

/// Convert nanoseconds since Unix epoch to ISO 8601 timestamp
fn nanoseconds_to_iso(nanos: i64) -> String {
    let secs = nanos / 1_000_000_000;
    let subsec_nanos = (nanos % 1_000_000_000) as u32;

    chrono::DateTime::from_timestamp(secs, subsec_nanos)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| "invalid_timestamp".to_string())
}

/// Fetches all spans for a trace with exception data and builds UUID to sequential ID mapping.
///
/// # Arguments
/// * `clickhouse` - ClickHouse database client
/// * `project_id` - Project identifier
/// * `trace_id` - Trace identifier
///
/// # Returns
/// Tuple of (spans, uuid_to_seq_map) where spans are ordered by start_time ASC
/// and uuid_to_seq_map maps span UUIDs to sequential IDs (1-indexed)
pub async fn get_trace_spans(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<(Vec<CHSpanWithException>, HashMap<Uuid, usize>)> {
    let ch_spans = clickhouse
        .query(
            r#"
            SELECT
                s.span_id,
                s.parent_span_id,
                s.name,
                s.span_type,
                s.start_time,
                s.end_time,
                s.input,
                s.output,
                s.status,
                e.exception
            FROM spans s
            LEFT JOIN (
                SELECT 
                    span_id,
                    any(attributes) as exception
                FROM events
                WHERE project_id = ?
                  AND trace_id = ?
                  AND name = 'exception'
                GROUP BY span_id
            ) e ON s.span_id = e.span_id
            WHERE s.trace_id = ?
              AND s.project_id = ?
            ORDER BY s.start_time ASC
            "#,
        )
        .bind(project_id)
        .bind(trace_id)
        .bind(trace_id)
        .bind(project_id)
        .fetch_all::<CHSpanWithException>()
        .await?;
    log::debug!(
        "[TRACE_ANALYSIS] Got {} spans for trace {}",
        ch_spans.len(),
        trace_id
    );

    // Build mapping: UUID -> sequential ID (1-indexed)
    let uuid_to_seq: HashMap<Uuid, usize> = ch_spans
        .iter()
        .enumerate()
        .map(|(idx, span)| (span.span_id, idx + 1))
        .collect();

    Ok((ch_spans, uuid_to_seq))
}

/// Fetches full span information for specific span IDs (sequential IDs, not UUIDs).
///
/// # Arguments
/// * `clickhouse` - ClickHouse database client
/// * `project_id` - Project identifier
/// * `trace_id` - Trace identifier  
/// * `span_ids` - List of sequential span IDs (1-indexed) to fetch full info for
///
/// # Returns
/// List of SpanInfo containing full span information including complete input/output
pub async fn get_full_span_info(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    span_ids: Vec<usize>,
) -> Result<Vec<SpanInfo>> {
    log::info!(
        "Fetching full info for {} spans from trace {}",
        span_ids.len(),
        trace_id
    );
    log::debug!("Fetching full info for spans: {:?}", span_ids);

    let (ch_spans, uuid_to_seq) = get_trace_spans(&clickhouse, project_id, trace_id).await?;

    if ch_spans.is_empty() {
        log::warn!("No spans found for trace {}", trace_id);
        return Ok(vec![]);
    }

    let mut result_spans = Vec::new();

    for span_id in span_ids {
        if span_id < 1 || span_id > ch_spans.len() {
            log::warn!("Span ID {} out of range (1-{})", span_id, ch_spans.len());
            continue;
        }

        let ch_span = &ch_spans[span_id - 1];

        let parent = if ch_span.parent_span_id != Uuid::nil() {
            uuid_to_seq.get(&ch_span.parent_span_id).copied()
        } else {
            None
        };

        let exception = if ch_span.exception.is_empty() {
            None
        } else {
            Some(try_parse_json(&ch_span.exception)).filter(|v| !v.is_null())
        };

        let span_info = SpanInfo {
            id: span_id,
            name: ch_span.name.clone(),
            span_type: get_span_type_str(ch_span.span_type),
            start: nanoseconds_to_iso(ch_span.start_time),
            end: nanoseconds_to_iso(ch_span.end_time),
            status: ch_span.status.clone(),
            input: try_parse_json(&ch_span.input),
            output: try_parse_json(&ch_span.output),
            parent,
            exception,
        };

        result_spans.push(span_info);
    }

    log::info!("Retrieved full info for {} spans", result_spans.len());
    Ok(result_spans)
}
