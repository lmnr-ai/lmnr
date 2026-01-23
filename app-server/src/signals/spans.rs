use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use super::utils::try_parse_json;

const TRUNCATE_THRESHOLD: usize = 64;
const PREVIEW_LENGTH: usize = 24;

/// Raw span from ClickHouse with exception data
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHSpanWithException {
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub name: String,
    pub span_type: u8,
    pub path: String,
    /// Start time in nanoseconds
    pub start_time: i64,
    /// End time in nanoseconds
    pub end_time: i64,
    pub input: String,
    pub output: String,
    pub status: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub parent_span_id: Uuid,
    pub exception: String,
}

/// Compressed span with sequential ID
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CompressedSpan {
    pub id: usize,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub span_type: String,
    pub start: i64,
    pub end: i64,
    pub duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Value>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exception: Option<Value>,
}

/// Get span type string
pub fn get_span_type(span_type: u8) -> &'static str {
    match span_type {
        1 => "llm",
        6 => "tool",
        _ => "default",
    }
}

/// Truncate a value if its string representation exceeds TRUNCATE_THRESHOLD
fn truncate_value(value: &Value) -> Value {
    let value_str = match value {
        Value::String(s) => s.clone(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    };

    if value_str.len() <= TRUNCATE_THRESHOLD {
        return value.clone();
    }

    let start = &value_str[..PREVIEW_LENGTH.min(value_str.len())];
    let end_start = value_str.len().saturating_sub(PREVIEW_LENGTH);
    let end = &value_str[end_start..];
    let omitted = value_str.len().saturating_sub(PREVIEW_LENGTH * 2);

    Value::String(format!("{}...({} chars omitted)...{}", start, omitted, end))
}

/// Compress span content based on type and occurrence
pub fn compress_span_content(ch_spans: &[CHSpanWithException]) -> Vec<CompressedSpan> {
    // Build span UUID to sequential ID mapping (1-indexed)
    let span_uuid_to_id: HashMap<Uuid, usize> = ch_spans
        .iter()
        .enumerate()
        .map(|(i, span)| (span.span_id, i + 1))
        .collect();

    // Track which LLM paths we've already seen
    let mut seen_llm_paths: HashSet<String> = HashSet::new();

    ch_spans
        .iter()
        .enumerate()
        .map(|(i, ch_span)| {
            let is_llm = ch_span.span_type == 1;
            let path = ch_span.path.clone();
            let duration_ns = ch_span.end_time - ch_span.start_time;
            let duration_secs = duration_ns as f64 / 1_000_000_000.0;

            let parent = if ch_span.parent_span_id.is_nil() || ch_span.parent_span_id == Uuid::nil()
            {
                None
            } else {
                span_uuid_to_id.get(&ch_span.parent_span_id).copied()
            };

            let (input, output) = if is_llm {
                let input_data = try_parse_json(&ch_span.input);
                let output_data = try_parse_json(&ch_span.output);

                if seen_llm_paths.contains(&path) {
                    // Subsequent LLM span at same path: only output
                    (None, Some(output_data))
                } else {
                    // First LLM span at this path: include full input and output
                    seen_llm_paths.insert(path.clone());
                    (Some(input_data), Some(output_data))
                }
            } else {
                // Non-LLM span: truncate if needed
                let input_data = try_parse_json(&ch_span.input);
                let output_data = try_parse_json(&ch_span.output);

                let truncated_input = truncate_value(&input_data);
                let truncated_output = truncate_value(&output_data);

                let input_opt = if truncated_input != Value::String("".to_string())
                    && truncated_input != Value::Null
                {
                    Some(truncated_input)
                } else {
                    None
                };

                let output_opt = if truncated_output != Value::String("".to_string())
                    && truncated_output != Value::Null
                {
                    Some(truncated_output)
                } else {
                    None
                };

                (input_opt, output_opt)
            };

            let exception = if !ch_span.exception.is_empty() && ch_span.exception != "<null>" {
                Some(try_parse_json(&ch_span.exception))
            } else {
                None
            };

            CompressedSpan {
                id: i + 1,
                name: ch_span.name.clone(),
                path: path.clone(),
                span_type: get_span_type(ch_span.span_type).to_string(),
                start: ch_span.start_time,
                end: ch_span.end_time,
                duration: duration_secs,
                input,
                output,
                status: if ch_span.status == "<null>" || ch_span.status.is_empty() {
                    String::new()
                } else {
                    ch_span.status.clone()
                },
                parent,
                exception,
            }
        })
        .collect()
}

/// Create skeleton string representation of spans
pub fn spans_to_skeleton_string(spans: &[CompressedSpan]) -> String {
    let mut skeleton = String::from("legend: span_name (id, parent_id, type)\n");
    for span in spans {
        let parent_str = span
            .parent
            .map(|p| p.to_string())
            .unwrap_or_else(|| "None".to_string());
        skeleton.push_str(&format!(
            "- {} ({}, {}, {})\n",
            span.name, span.id, parent_str, span.span_type
        ));
    }
    skeleton
}

/// Query trace spans from ClickHouse with exception events
pub async fn get_trace_spans(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<Vec<CHSpanWithException>> {
    let query = r#"
        SELECT
            s.span_id,
            s.name,
            s.span_type,
            s.path,
            s.start_time,
            s.end_time,
            s.input,
            s.output,
            s.status,
            s.parent_span_id,
            COALESCE(e.exception, '') as exception
        FROM spans s
        LEFT JOIN (
            SELECT 
                span_id,
                any(attributes) as exception
            FROM events
            WHERE project_id = ? AND trace_id = ? AND name = 'exception'
            GROUP BY span_id
        ) e ON s.span_id = e.span_id
        WHERE s.trace_id = ? AND s.project_id = ?
        ORDER BY s.start_time ASC
    "#;

    let spans = clickhouse
        .query(query)
        .bind(project_id)
        .bind(trace_id)
        .bind(trace_id)
        .bind(project_id)
        .fetch_all::<CHSpanWithException>()
        .await?;

    Ok(spans)
}

/// Query trace spans from ClickHouse with exception events and build UUID to sequential ID mapping.
pub async fn get_trace_spans_with_id_mapping(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<(Vec<CHSpanWithException>, HashMap<Uuid, usize>)> {
    let spans = get_trace_spans(clickhouse, project_id, trace_id).await?;

    // Build mapping: UUID -> sequential ID (1-indexed)
    let uuid_to_seq: HashMap<Uuid, usize> = spans
        .iter()
        .enumerate()
        .map(|(idx, span)| (span.span_id, idx + 1))
        .collect();

    Ok((spans, uuid_to_seq))
}

/// Get trace structure as a formatted string with skeleton and YAML
pub async fn get_trace_structure_as_string(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<String> {
    // Fetch raw spans
    let ch_spans = get_trace_spans(clickhouse, project_id, trace_id).await?;

    // Compress spans
    let compressed_spans = compress_span_content(&ch_spans);

    // Create skeleton view
    let trace_skeleton = spans_to_skeleton_string(&compressed_spans);

    // Filter to only LLM and Tool spans for detailed view
    let filtered_spans: Vec<&CompressedSpan> = compressed_spans
        .iter()
        .filter(|span| span.span_type != "default")
        .collect();

    // Convert to YAML
    let trace_yaml = serde_yaml::to_string(&filtered_spans)?;

    // Build final string
    let trace_string = format!(
        "Here is the skeleton view of the trace:\n<trace_skeleton>\n{}</trace_skeleton>\n\nHere are the detailed views of LLM and Tool spans:\n<spans>\n{}</spans>\n",
        trace_skeleton, trace_yaml
    );

    Ok(trace_string)
}
