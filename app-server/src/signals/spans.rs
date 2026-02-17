use anyhow::Result;
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::ch::spans::CHSpan;

use super::utils::try_parse_json;

const TRUNCATE_THRESHOLD: usize = 1024;
const BASE64_IMAGE_PLACEHOLDER: &str = "[base64 image omitted]";
/// Max chars to keep per message in LLM span inputs (~1K tokens).
const LLM_MESSAGE_MAX_CHARS: usize = 3000;

/// Compressed span identified by the last 4 hex chars of its UUID
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CompressedSpan {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub span_type: String,
    pub start: String,
    pub duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Value>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exception: Option<Value>,
}

const SPAN_SHORT_ID_LEN: usize = 6;

/// Extract the last 6 hex characters of a UUID as a short identifier.
pub fn span_short_id(uuid: &Uuid) -> String {
    let s = uuid.to_string().replace('-', "");
    s[s.len() - SPAN_SHORT_ID_LEN..].to_string()
}

/// Format a nanosecond timestamp as a human-readable UTC string.
fn format_ns_timestamp(ns: i64) -> String {
    let secs = ns / 1_000_000_000;
    let nanos = (ns % 1_000_000_000) as u32;
    DateTime::from_timestamp(secs, nanos)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S UTC").to_string())
        .unwrap_or_else(|| ns.to_string())
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

    let char_count = value_str.chars().count();
    if char_count <= TRUNCATE_THRESHOLD {
        return value.clone();
    }

    let truncated: String = value_str.chars().take(TRUNCATE_THRESHOLD).collect();
    let omitted = char_count - TRUNCATE_THRESHOLD;
    Value::String(format!("{}... ({} chars truncated)", truncated, omitted))
}

/// Truncate LLM input messages. If the input is an array of messages, each message's
/// string fields are individually capped at LLM_MESSAGE_MAX_CHARS so that no single
/// large message causes later messages to be lost.
fn truncate_llm_input(value: &Value) -> Value {
    match value {
        Value::Array(messages) => {
            Value::Array(messages.iter().map(truncate_message_strings).collect())
        }
        _ => value.clone(),
    }
}

/// Truncate large strings in a message, handling both plain string fields and
/// multimodal content arrays (e.g. `[{"type":"text","text":"..."}]`).
fn truncate_message_strings(message: &Value) -> Value {
    match message {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), truncate_value_strings(v)))
                .collect(),
        ),
        _ => message.clone(),
    }
}

/// Recursively truncate any string that exceeds LLM_MESSAGE_MAX_CHARS.
fn truncate_value_strings(value: &Value) -> Value {
    match value {
        Value::String(s) if s.chars().count() > LLM_MESSAGE_MAX_CHARS => {
            let truncated: String = s.chars().take(LLM_MESSAGE_MAX_CHARS).collect();
            let omitted = s.chars().count() - LLM_MESSAGE_MAX_CHARS;
            Value::String(format!("{}... ({} chars truncated)", truncated, omitted))
        }
        Value::Array(arr) => Value::Array(arr.iter().map(truncate_value_strings).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), truncate_value_strings(v)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// Replace base64 image data within a JSON value with a placeholder.
///
/// Detects data URLs of the form `data:image/...;base64,...` anywhere in the JSON tree.
pub fn replace_base64_images(value: &Value) -> Value {
    match value {
        Value::String(s) => {
            if let Some(idx) = s.find("base64,") {
                let prefix = &s[..idx + "base64,".len()];
                if prefix.starts_with("data:image") {
                    return Value::String(BASE64_IMAGE_PLACEHOLDER.to_string());
                }
            }
            value.clone()
        }
        Value::Array(arr) => Value::Array(arr.iter().map(replace_base64_images).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), replace_base64_images(v)))
                .collect(),
        ),
        _ => value.clone(),
    }
}

/// Remove `signature` and `thought_signature` fields from LLM span inputs and outputs.
/// These fields contain large hash values that waste context and provide no analytical value.
pub fn strip_signature_fields(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(k, _)| k.as_str() != "signature" && k.as_str() != "thought_signature")
                .map(|(k, v)| (k.clone(), strip_signature_fields(v)))
                .collect(),
        ),
        Value::Array(arr) => Value::Array(arr.iter().map(strip_signature_fields).collect()),
        _ => value.clone(),
    }
}

/// Extract exception attributes from span events.
/// Events are stored as `(timestamp, name, attributes)` tuples; we look for `name == "exception"`.
pub fn extract_exception_from_events(events: &[(i64, String, String)]) -> Option<Value> {
    events
        .iter()
        .find(|(_, name, _)| name == "exception")
        .map(|(_, _, attrs)| try_parse_json(attrs))
        .filter(|v| !v.is_null())
}

/// Compress span content based on type and occurrence.
/// Spans are identified by the last 4 hex chars of their UUID, which is stable
/// across iterations regardless of span arrival order.
pub fn compress_span_content(ch_spans: &[CHSpan]) -> Vec<CompressedSpan> {
    // Build span UUID to short ID mapping
    let span_uuid_to_short: HashMap<Uuid, String> = ch_spans
        .iter()
        .map(|span| (span.span_id, span_short_id(&span.span_id)))
        .collect();

    // Track which LLM paths we've already seen
    let mut seen_llm_paths: HashSet<String> = HashSet::new();

    ch_spans
        .iter()
        .map(|ch_span| {
            let is_llm = ch_span.span_type == 1;
            let path = ch_span.path.clone();
            let duration_ns = ch_span.end_time - ch_span.start_time;
            let duration_secs = duration_ns as f64 / 1_000_000_000.0;

            let parent = if ch_span.parent_span_id.is_nil() || ch_span.parent_span_id == Uuid::nil()
            {
                None
            } else {
                span_uuid_to_short.get(&ch_span.parent_span_id).cloned()
            };

            let (input, output) = if is_llm {
                let input_data = truncate_llm_input(&strip_signature_fields(
                    &replace_base64_images(&try_parse_json(&ch_span.input)),
                ));
                let output_data = strip_signature_fields(&try_parse_json(&ch_span.output));

                if seen_llm_paths.contains(&path) {
                    // Subsequent LLM span at same path: only output
                    (None, Some(output_data))
                } else {
                    // First LLM span at this path: include truncated input and full output
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

            let exception = extract_exception_from_events(&ch_span.events);

            CompressedSpan {
                id: span_short_id(&ch_span.span_id),
                name: ch_span.name.clone(),
                path: path.clone(),
                span_type: get_span_type(ch_span.span_type).to_string(),
                start: format_ns_timestamp(ch_span.start_time),
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
        let parent_str = span.parent.as_deref().unwrap_or("None");
        skeleton.push_str(&format!(
            "- {} ({}, {}, {})\n",
            span.name, span.id, parent_str, span.span_type
        ));
    }
    skeleton
}

/// Query trace spans from ClickHouse
pub async fn get_trace_spans(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<Vec<CHSpan>> {
    let query = r#"
        SELECT * FROM spans
        WHERE project_id = ? AND trace_id = ?
        ORDER BY start_time ASC
    "#;

    let spans = clickhouse
        .query(query)
        .bind(project_id)
        .bind(trace_id)
        .fetch_all::<CHSpan>()
        .await?;

    Ok(spans)
}

/// Get trace structure as a formatted string with skeleton and YAML
pub async fn get_trace_structure_as_string(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<String> {
    // Fetch raw spans
    let ch_spans = get_trace_spans(clickhouse, project_id, trace_id).await?;

    if ch_spans.is_empty() {
        return Ok(format!(
            "No spans found for trace {}. Either the trace does not exist in this project or there are no spans in the trace.",
            trace_id
        ));
    }

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
