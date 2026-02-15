use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::spans::{get_span_type, get_trace_spans_with_id_mapping};
use super::utils::{nanoseconds_to_iso, try_parse_json};
use crate::signals::gemini::{FunctionDeclaration, Tool};
use crate::signals::prompts::{GET_FULL_SPAN_INFO_DESCRIPTION, SUBMIT_IDENTIFICATION_DESCRIPTION};

/// Full span info returned by get_full_spans tool
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
            name: "get_full_spans".to_string(),
            description: GET_FULL_SPAN_INFO_DESCRIPTION.to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "span_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "REQUIRED. List of span IDs (sequential integers starting from 1) to fetch full information for. You MUST always provide this argument."
                    }
                },
                "required": ["span_ids"]
            }),
        },
        FunctionDeclaration {
            name: "submit_identification".to_string(),
            description: SUBMIT_IDENTIFICATION_DESCRIPTION.to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "identified": {
                        "type": "boolean",
                        "description": "REQUIRED. Whether the information described by the developer's prompt can be extracted from or identified in the trace. You MUST always include this argument."
                    },
                    "data": {
                        "type": "object",
                        "description": "The data extracted from / identified in the trace. REQUIRED when identified=true — provide an object matching the developer's schema. When identified=false, you can omit this field or provide an empty object.",
                        "properties": properties,
                        "required": required
                    },
                    "_summary":  {
                        "type": "string",
                        "description": "REQUIRED when identified=true. A short summary of the identification result, used for clustering of events. You MUST provide this field whenever identified=true."
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
pub async fn get_full_spans(
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

    Ok(result_spans)
}
