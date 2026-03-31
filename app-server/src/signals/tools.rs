use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::ch::spans::CHSpan;

use super::search::fuzzy_search;
use super::spans::{extract_exception_from_events, get_span_type, span_short_id};
use super::utils::{nanoseconds_to_iso, strip_noise, try_parse_json};
use crate::signals::prompts::{
    GET_FULL_SPAN_INFO_DESCRIPTION, SEARCH_IN_SPANS_DESCRIPTION, SUBMIT_IDENTIFICATION_DESCRIPTION,
};
use crate::signals::provider::models::{ProviderFunctionDeclaration, ProviderTool};

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

pub fn build_tool_definitions(output_schema: &Value) -> ProviderTool {
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
        ProviderFunctionDeclaration {
            name: "search_in_spans".to_string(),
            description: SEARCH_IN_SPANS_DESCRIPTION.to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "searches": {
                        "type": "array",
                        "description": "REQUIRED. List of search operations to perform. Include ALL searches you need in this single call — do not plan to call this tool multiple times sequentially.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "reasoning": {
                                    "type": "string",
                                    "description": "Explanation of why this search is needed."
                                },
                                "span_id": {
                                    "type": "string",
                                    "description": "REQUIRED. The span ID (6-character hex string, e.g. 'a1b2c3') to search within."
                                },
                                "literal": {
                                    "type": "string",
                                    "description": "REQUIRED. Plain text to search for. Fuzzy matching is applied automatically (case-insensitive, whitespace-normalized, word proximity) — just provide the text you're looking for."
                                },
                                "search_in": {
                                    "type": "string",
                                    "enum": ["input", "output"],
                                    "description": "Which field of the span to search within."
                                }
                            },
                            "required": ["reasoning", "span_id", "literal", "search_in"]
                        }
                    }
                },
                "required": ["searches"]
            }),
        },
        ProviderFunctionDeclaration {
            name: "get_full_spans".to_string(),
            description: GET_FULL_SPAN_INFO_DESCRIPTION.to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "reasoning": {
                        "type": "string",
                        "description": "REQUIRED. Explain why search_in_spans is insufficient and why do you need full span details."
                    },
                    "span_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "REQUIRED. List of span IDs (6-character hex strings, e.g. 'a1b2c3') to fetch full information for. You MUST always provide this argument."
                    }
                },
                "required": ["reasoning", "span_ids"]
            }),
        },
        ProviderFunctionDeclaration {
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

    ProviderTool {
        function_declarations,
    }
}

/// For LLM span inputs (JSON arrays of messages), keep only the last `n` messages.
/// Returns the value unchanged if it's not an array or has fewer than `n` elements.
fn truncate_messages(value: Value, n: usize) -> Value {
    match value {
        Value::Array(arr) if arr.len() > n => Value::Array(arr[arr.len() - n..].to_vec()),
        other => other,
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
        "SELECT * FROM spans WHERE trace_id = ? AND project_id = ? AND lower(right(hex(span_id), 6)) IN ({}) ORDER BY start_time ASC",
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

            let is_llm = ch_span.span_type == 1;
            let input = try_parse_json(&strip_noise(&ch_span.input));
            let input = if is_llm {
                truncate_messages(input, 2)
            } else {
                input
            };

            SpanInfo {
                id: span_short_id(&ch_span.span_id),
                name: ch_span.name.clone(),
                span_type: get_span_type(ch_span.span_type).to_string(),
                start: nanoseconds_to_iso(ch_span.start_time),
                end: nanoseconds_to_iso(ch_span.end_time),
                status: ch_span.status.clone(),
                input,
                output: try_parse_json(&strip_noise(&ch_span.output)),
                parent,
                exception,
            }
        })
        .collect();

    Ok(result_spans)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanSearchRequest {
    pub span_id: String,
    pub literal: String,
    pub search_in: String,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpanSearchResult {
    pub span_id: String,
    pub matches: Vec<super::search::SearchMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn search_in_spans(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    searches: Vec<SpanSearchRequest>,
) -> Result<Vec<SpanSearchResult>> {
    let unique_span_ids: Vec<String> = searches
        .iter()
        .map(|s| s.span_id.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    log::info!(
        "search_in_spans: {} searches across {} unique spans in trace {}",
        searches.len(),
        unique_span_ids.len(),
        trace_id
    );

    let hex_literals: Vec<String> = unique_span_ids
        .iter()
        .filter(|id| id.chars().all(|c| c.is_ascii_hexdigit()))
        .map(|id| format!("'{}'", id.to_lowercase()))
        .collect();

    if hex_literals.is_empty() {
        return Ok(searches
            .iter()
            .map(|s| SpanSearchResult {
                span_id: s.span_id.clone(),
                matches: vec![],
                error: Some("Invalid span_id format".to_string()),
            })
            .collect());
    }

    let in_clause = hex_literals.join(", ");
    let query = format!(
        "SELECT * FROM spans WHERE trace_id = ? AND project_id = ? AND lower(right(hex(span_id), 6)) IN ({}) ORDER BY start_time ASC",
        in_clause
    );

    let ch_spans = clickhouse
        .query(&query)
        .bind(trace_id)
        .bind(project_id)
        .fetch_all::<CHSpan>()
        .await?;

    let span_map: std::collections::HashMap<String, &CHSpan> = ch_spans
        .iter()
        .map(|s| (span_short_id(&s.span_id), s))
        .collect();

    let results = searches
        .iter()
        .map(|search| {
            let Some(ch_span) = span_map.get(&search.span_id.to_lowercase()) else {
                return SpanSearchResult {
                    span_id: search.span_id.clone(),
                    matches: vec![],
                    error: Some("Span not found".to_string()),
                };
            };

            let raw = match search.search_in.as_str() {
                "input" => &ch_span.input,
                _ => &ch_span.output,
            };
            let content = strip_noise(raw);

            let matches = fuzzy_search(&content, &search.literal);
            if !matches.is_empty() {
                SpanSearchResult {
                    span_id: search.span_id.clone(),
                    matches,
                    error: None,
                }
            } else {
                SpanSearchResult {
                    span_id: search.span_id.clone(),
                    matches: vec![],
                    error: Some("No matches found".to_string()),
                }
            }
        })
        .collect();

    Ok(results)
}
