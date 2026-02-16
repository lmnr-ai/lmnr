use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::ch::spans::CHSpan;

use super::spans::{
    extract_exception_from_events, get_span_type, replace_base64_images, span_short_id,
    strip_signature_fields,
};
use super::utils::{nanoseconds_to_iso, try_parse_json};
use crate::signals::gemini::{FunctionDeclaration, Tool};
use crate::signals::prompts::{GET_FULL_SPAN_INFO_DESCRIPTION, SUBMIT_IDENTIFICATION_DESCRIPTION};

/// Full span info returned by get_full_spans tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanInfo {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub span_type: String,
    pub start: String,
    pub end: String,
    pub status: String,
    pub input: Value,
    pub output: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
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
                        "items": {"type": "string"},
                        "description": "REQUIRED. List of span IDs (6-character hex strings, e.g. 'a1b2c3') to fetch full information for. You MUST always provide this argument."
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
                    "summary":  {
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

/// Fetches full span information for specific span IDs (last 6 hex chars of UUID).
/// Queries ClickHouse directly with a suffix filter instead of fetching all spans.
///
/// # Arguments
/// * `clickhouse` - ClickHouse database client
/// * `project_id` - Project identifier
/// * `trace_id` - Trace identifier
/// * `span_ids` - List of span short IDs (6-char hex suffixes) to fetch full info for
///
/// # Returns
/// List of SpanInfo containing full span information including complete input/output
pub async fn get_full_spans(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    span_ids: Vec<String>,
) -> Result<Vec<SpanInfo>> {
    log::info!(
        "Fetching full info for {} spans from trace {}",
        span_ids.len(),
        trace_id
    );
    log::debug!("Fetching full info for spans: {:?}", span_ids);

    // Validate and collect hex suffixes for the SQL IN clause
    let hex_literals: Vec<String> = span_ids
        .iter()
        .filter(|id| id.chars().all(|c| c.is_ascii_hexdigit()))
        .map(|id| format!("'{}'", id.to_lowercase()))
        .collect();

    if hex_literals.is_empty() {
        return Ok(vec![]);
    }

    let in_clause = hex_literals.join(", ");

    let query = format!(
        r#"
        SELECT *
        FROM spans
        WHERE trace_id = ? AND project_id = ?
          AND lower(right(hex(span_id), 6)) IN ({})
        ORDER BY start_time ASC
        "#,
        in_clause
    );

    let ch_spans = clickhouse
        .query(&query)
        .bind(trace_id)
        .bind(project_id)
        .fetch_all::<CHSpan>()
        .await?;

    let result_spans: Vec<SpanInfo> = ch_spans
        .iter()
        .map(|ch_span| {
            let parent = if ch_span.parent_span_id != Uuid::nil() {
                Some(span_short_id(&ch_span.parent_span_id))
            } else {
                None
            };

            let exception = extract_exception_from_events(&ch_span.events);

            SpanInfo {
                id: span_short_id(&ch_span.span_id),
                name: ch_span.name.clone(),
                span_type: get_span_type(ch_span.span_type).to_string(),
                start: nanoseconds_to_iso(ch_span.start_time),
                end: nanoseconds_to_iso(ch_span.end_time),
                status: ch_span.status.clone(),
                input: strip_signature_fields(&replace_base64_images(&try_parse_json(
                    &ch_span.input,
                ))),
                output: strip_signature_fields(&replace_base64_images(&try_parse_json(
                    &ch_span.output,
                ))),
                parent,
                exception,
            }
        })
        .collect();

    Ok(result_spans)
}
