use anyhow::Result;
use chrono::DateTime;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fmt::Write;
use uuid::Uuid;

use crate::ch::spans::CHSpan;

use super::utils::try_parse_json;

const TRUNCATE_THRESHOLD: usize = 1024;
const BASE64_IMAGE_PLACEHOLDER: &str = "[base64 image omitted]";
/// Max chars to keep per message in LLM span inputs (~1K tokens).
const LLM_MESSAGE_MAX_CHARS: usize = 3000;

pub struct CompressedSpan {
    pub id: String,
    pub name: String,
    pub path: String,
    pub span_type: String,
    pub start: String,
    pub duration: f64,
    pub total_cost: f64,
    pub total_tokens: i64,
    pub input: String,
    pub output: String,
    pub output_truncated: bool,
    pub status: String,
    pub parent: Option<String>,
    pub exception: Option<String>,
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

fn omit_or_empty(raw: &str) -> String {
    let value = try_parse_json(raw);
    if is_empty_value(&value) {
        return "<empty>".to_string();
    }
    let char_count = raw.chars().count();
    format!("<omitted {} chars>", char_count)
}

fn is_empty_value(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        _ => false,
    }
}

/// Get span type string
pub fn get_span_type(span_type: u8) -> &'static str {
    match span_type {
        1 => "llm",
        6 => "tool",
        _ => "default",
    }
}

/// Returns (truncated_value, was_truncated).
fn truncate_value(value: &Value, truncated: &mut bool) -> Value {
    let value_str = match value {
        Value::String(s) => s.clone(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    };

    let char_count = value_str.chars().count();
    if char_count <= TRUNCATE_THRESHOLD {
        return value.clone();
    }

    *truncated = true;
    let kept: String = value_str.chars().take(TRUNCATE_THRESHOLD).collect();
    let omitted = char_count - TRUNCATE_THRESHOLD;
    Value::String(format!("{}<truncated {} more chars>", kept, omitted))
}

fn truncate_llm_input(value: &Value, truncated: &mut bool) -> Value {
    match value {
        Value::Array(messages) => Value::Array(
            messages
                .iter()
                .map(|m| truncate_message_strings(m, truncated))
                .collect(),
        ),
        _ => value.clone(),
    }
}

fn truncate_message_strings(message: &Value, truncated: &mut bool) -> Value {
    match message {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), truncate_value_strings(v, truncated)))
                .collect(),
        ),
        _ => message.clone(),
    }
}

fn truncate_value_strings(value: &Value, truncated: &mut bool) -> Value {
    match value {
        Value::String(s) if s.chars().count() > LLM_MESSAGE_MAX_CHARS => {
            *truncated = true;
            let kept: String = s.chars().take(LLM_MESSAGE_MAX_CHARS).collect();
            let omitted = s.chars().count() - LLM_MESSAGE_MAX_CHARS;
            Value::String(format!("{}<truncated {} more chars>", kept, omitted))
        }
        Value::Array(arr) => Value::Array(
            arr.iter()
                .map(|v| truncate_value_strings(v, truncated))
                .collect(),
        ),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), truncate_value_strings(v, truncated)))
                .collect(),
        ),
        other => other.clone(),
    }
}

const RAW_BASE64_IMAGE_PREFIXES: &[&str] = &[
    "/9j/",        // JPEG
    "iVBORw0KGgo", // PNG
    "R0lGODlh",    // GIF
    "UklGR",       // WebP
    "PHN2Zz",      // SVG
];

/// Minimum length for a raw base64 string to be considered an image.
const RAW_BASE64_MIN_LEN: usize = 64;

/// Check whether a string looks like raw base64-encoded image data.
fn is_raw_base64_image(s: &str) -> bool {
    s.len() >= RAW_BASE64_MIN_LEN
        && RAW_BASE64_IMAGE_PREFIXES
            .iter()
            .any(|prefix| s.starts_with(prefix))
}

/// Replace base64 image data within a JSON value with a placeholder.
///
/// Detects both data URLs (`data:image/...;base64,...`) and raw base64 image
/// strings identified by well-known magic byte prefixes (JPEG, PNG, GIF, WebP, SVG).
pub fn replace_base64_images(value: &Value) -> Value {
    match value {
        Value::String(s) => {
            if let Some(idx) = s.find("base64,") {
                let prefix = &s[..idx + "base64,".len()];
                if prefix.starts_with("data:image") {
                    return Value::String(BASE64_IMAGE_PLACEHOLDER.to_string());
                }
            }
            if is_raw_base64_image(s) {
                return Value::String(BASE64_IMAGE_PLACEHOLDER.to_string());
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

            let mut output_truncated = false;

            let is_tool = ch_span.span_type == 6;

            let (input, output) = if is_llm {
                let output_data = strip_signature_fields(&try_parse_json(&ch_span.output));

                if seen_llm_paths.contains(&path) {
                    ("<omitted>".to_string(), value_to_string(&output_data))
                } else {
                    seen_llm_paths.insert(path.clone());
                    let mut _unused = false;
                    let input_data = truncate_llm_input(
                        &strip_signature_fields(&replace_base64_images(&try_parse_json(
                            &ch_span.input,
                        ))),
                        &mut _unused,
                    );
                    (value_to_string(&input_data), value_to_string(&output_data))
                }
            } else if is_tool {
                let input_raw = try_parse_json(&ch_span.input);
                let output_raw = try_parse_json(&ch_span.output);

                let mut _unused = false;
                let input = if is_empty_value(&input_raw) {
                    "<empty>".to_string()
                } else {
                    value_to_string(&truncate_value(&input_raw, &mut _unused))
                };

                let output = if is_empty_value(&output_raw) {
                    "<empty>".to_string()
                } else {
                    value_to_string(&truncate_value(&output_raw, &mut output_truncated))
                };

                (input, output)
            } else {
                let input = omit_or_empty(&ch_span.input);
                let output = omit_or_empty(&ch_span.output);
                (input, output)
            };

            let exception =
                extract_exception_from_events(&ch_span.events).map(|v| value_to_string(&v));

            CompressedSpan {
                id: span_short_id(&ch_span.span_id),
                name: ch_span.name.clone(),
                path: path.clone(),
                span_type: get_span_type(ch_span.span_type).to_string(),
                start: format_ns_timestamp(ch_span.start_time),
                duration: duration_secs,
                total_cost: ch_span.total_cost,
                total_tokens: ch_span.total_tokens,
                input,
                output,
                output_truncated,
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

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn spans_to_string(spans: &[CompressedSpan]) -> String {
    let mut out = String::new();
    for span in spans {
        let is_llm = span.span_type == "llm";
        let _ = writeln!(out, "- id: {}", span.id);
        let _ = writeln!(out, "  name: {}", span.name);
        let _ = writeln!(out, "  path: {}", span.path);
        let _ = writeln!(out, "  type: {}", span.span_type);
        let _ = writeln!(out, "  start: {}", span.start);
        let _ = writeln!(out, "  duration: {:.1}s", span.duration);
        if is_llm {
            let _ = writeln!(out, "  total_cost: {}", span.total_cost);
            let _ = writeln!(out, "  total_tokens: {}", span.total_tokens);
        }
        if let Some(parent) = &span.parent {
            let _ = writeln!(out, "  parent: {}", parent);
        } else {
            let _ = writeln!(out, "  parent: <it_is_the_root_span>");
        }
        if !span.status.is_empty() {
            let _ = writeln!(out, "  status: {}", span.status);
        }
        if span.output_truncated {
            let _ = writeln!(out, "  output_truncated: true");
        }
        if let Some(exception) = &span.exception {
            let _ = writeln!(out, "  exception: {}", exception);
        }
        let _ = writeln!(out, "  input: {}", span.input);
        let _ = writeln!(out, "  output: {}", span.output);
    }
    out
}

// TODO: move these two functions to CH Query engine for better integration
// with hybrid deployment mode.
/// Query trace spans from ClickHouse
async fn get_trace_spans(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<Vec<CHSpan>> {
    let query = "
        SELECT
            span_id,
            name,
            span_type,
            start_time,
            end_time,
            input_cost,
            output_cost,
            total_cost,
            model,
            session_id,
            project_id,
            trace_id,
            provider,
            input_tokens,
            output_tokens,
            total_tokens,
            user_id,
            path,
            input,
            output,
            size_bytes,
            status,
            attributes,
            request_model,
            response_model,
            parent_span_id,
            trace_metadata,
            trace_type,
            tags_array,
            events
        FROM spans
        WHERE project_id = ? AND trace_id = ?
        ORDER BY start_time ASC
    ";

    let spans = clickhouse
        .query(query)
        .bind(project_id)
        .bind(trace_id)
        .fetch_all::<CHSpan>()
        .await?;

    Ok(spans)
}

#[derive(clickhouse::Row, Deserialize)]
pub struct SpanIdAndEndTime {
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub end_time: i64,
}

pub async fn get_trace_span_ids_and_end_time(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<Vec<SpanIdAndEndTime>> {
    let query = "
        SELECT span_id, end_time FROM spans
        WHERE project_id = ? AND trace_id = ?
        ORDER BY start_time ASC";

    let spans = clickhouse
        .query(query)
        .bind(project_id)
        .bind(trace_id)
        .fetch_all()
        .await?;

    Ok(spans)
}

/// Get trace structure as YAML of all compressed spans
pub async fn get_trace_structure_as_string(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<String> {
    let ch_spans = get_trace_spans(clickhouse, project_id, trace_id).await?;

    if ch_spans.is_empty() {
        return Ok(format!(
            "No spans found for trace {}. Either the trace does not exist in this project or there are no spans in the trace.",
            trace_id
        ));
    }

    let compressed_spans = compress_span_content(&ch_spans);
    let trace_str = spans_to_string(&compressed_spans);

    Ok(format!(
        "Here are all spans of the trace:\n<spans>\n{}</spans>\n",
        trace_str
    ))
}
