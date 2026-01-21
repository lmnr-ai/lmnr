use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::spans::{get_span_type, get_trace_spans_with_id_mapping};
use super::utils::{nanoseconds_to_iso, try_parse_json};
use crate::trace_analysis::gemini::{FunctionDeclaration, Tool};

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

pub fn build_tool_definitions(output_schema: &Value) -> Tool {
    let properties = output_schema
        .get("properties")
        .cloned()
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));

    let required = output_schema
        .get("required")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let function_declarations = vec![
        FunctionDeclaration {
            name: "get_full_span_info".to_string(),
            description: "Retrieves complete information (full input, output, timing, etc.) for specific spans by their IDs. Use this when you need more details about spans to make an identification decision. The compressed trace view may have truncated or omitted some data.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "span_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "List of span IDs (sequential integers starting from 1) to fetch full information for."
                    }
                },
                "required": ["span_ids"]
            }),
        },
        FunctionDeclaration {
            name: "submit_identification".to_string(),
            description: "Submits the final identification result. Call this when you have determined whether the semantic event can be identified in the trace and have extracted the relevant data (if identified=true) or determined it cannot be found (if identified=false).".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "identified": {
                        "type": "boolean",
                        "description": "Whether the information described by the developer's prompt can be extracted from or identified in the trace."
                    },
                    "data": {
                        "type": "object",
                        "description": "Data that was extracted from / identified in the trace. If 'identified' flag is false, you can omit this field or provide an empty object.",
                        "properties": properties,
                        "required": required
                    }
                },
                "required": ["identified"]
            }),
        },
    ];

    Tool {
        function_declarations,
    }
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

    let (ch_spans, uuid_to_seq) =
        get_trace_spans_with_id_mapping(clickhouse, project_id, trace_id).await?;

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
            span_type: get_span_type(ch_span.span_type).to_string(),
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
