use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::ch::spans::CHSpan;

use super::spans::{
    extract_exception_from_events, get_span_type, replace_base64_images, span_short_id,
    strip_signature_fields,
};
use super::utils::{nanoseconds_to_iso, try_parse_json};
use crate::signals::prompts::{
    GET_FULL_SPAN_INFO_DESCRIPTION, REGEX_IN_SPANS_DESCRIPTION, SUBMIT_IDENTIFICATION_DESCRIPTION,
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
            name: "regex_in_spans".to_string(),
            description: REGEX_IN_SPANS_DESCRIPTION.to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "searches": {
                        "type": "array",
                        "description": "REQUIRED. List of regex search operations to perform.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "span_id": {
                                    "type": "string",
                                    "description": "The span ID (6-character hex string, e.g. 'a1b2c3') to search within."
                                },
                                "regex": {
                                    "type": "string",
                                    "description": "Regular expression pattern to match against the span's content. Uses standard regex syntax."
                                },
                                "search_in": {
                                    "type": "string",
                                    "enum": ["input", "output"],
                                    "description": "Which field of the span to search within."
                                },
                                "reasoning": {
                                    "type": "string",
                                    "description": "Explanation of why this search is needed and what the agent expects to learn from the results."
                                }
                            },
                            "required": ["span_id", "regex", "search_in", "reasoning"]
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
                        "description": "REQUIRED. Explain why regex_in_spans is insufficient and why these spans need full details."
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
            let input =
                strip_signature_fields(&replace_base64_images(&try_parse_json(&ch_span.input)));
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

const CONTEXT_PADDING: usize = 50;
const MAX_MATCHES_PER_SEARCH: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegexSearchRequest {
    pub span_id: String,
    pub regex: String,
    pub search_in: String,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegexSearchResult {
    pub span_id: String,
    pub matches: Vec<RegexMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegexMatch {
    pub snippet: String,
    pub offset: usize,
}

pub async fn regex_in_spans(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    searches: Vec<RegexSearchRequest>,
) -> Result<Vec<RegexSearchResult>> {
    let unique_span_ids: Vec<String> = searches
        .iter()
        .map(|s| s.span_id.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    log::info!(
        "regex_in_spans: {} searches across {} unique spans in trace {}",
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
            .map(|s| RegexSearchResult {
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
                return RegexSearchResult {
                    span_id: search.span_id.clone(),
                    matches: vec![],
                    error: Some("Span not found".to_string()),
                };
            };

            let raw = match search.search_in.as_str() {
                "input" => &ch_span.input,
                "output" => &ch_span.output,
                _ => {
                    return RegexSearchResult {
                        span_id: search.span_id.clone(),
                        matches: vec![],
                        error: Some(
                            "Invalid search_in value, must be 'input' or 'output'".to_string(),
                        ),
                    };
                }
            };
            match find_regex_matches(raw, &search.regex) {
                Ok(matches) => RegexSearchResult {
                    span_id: search.span_id.clone(),
                    matches,
                    error: None,
                },
                Err(e) => RegexSearchResult {
                    span_id: search.span_id.clone(),
                    matches: vec![],
                    error: Some(e),
                },
            }
        })
        .collect();

    Ok(results)
}

fn find_regex_matches(
    content: &str,
    pattern: &str,
) -> std::result::Result<Vec<RegexMatch>, String> {
    let re = Regex::new(pattern).map_err(|e| format!("Invalid regex: {}", e))?;

    let matches = re
        .find_iter(content)
        .take(MAX_MATCHES_PER_SEARCH)
        .map(|m| {
            let start = m.start().saturating_sub(CONTEXT_PADDING);
            let end = (m.end() + CONTEXT_PADDING).min(content.len());
            // Snap to char boundaries to avoid panics on multi-byte UTF-8
            let start = content.floor_char_boundary(start);
            let end = content.ceil_char_boundary(end);
            RegexMatch {
                snippet: content[start..end].to_string(),
                offset: m.start(),
            }
        })
        .collect();

    Ok(matches)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_match_with_newlines_in_json_raw() {
        let raw = r#"{"is_done":false,"success":null,"judgement":null,"error":null,"attachments":null,"images":null,"long_term_memory":null,"extracted_content":"Clicked a \"F2\nNew York, NY, USA\nThe AI pl...\"","include_extracted_content_only_once":false,"metadata":{"click_x":1112.5,"click_y":599.3828125},"include_in_memory":false}"#;
        let pattern = r"F2.*?\\n.*?\\n.*?AI pl\.\.\.";

        let matches = find_regex_matches(raw, pattern).unwrap();
        assert!(!matches.is_empty(), "Expected at least one match");
    }

    #[test]
    fn test_regex_simple_match() {
        let content = "hello world foo bar";
        let pattern = r"world.*bar";
        let matches = find_regex_matches(content, pattern).unwrap();
        assert_eq!(matches.len(), 1);
    }

    #[test]
    fn test_regex_no_match() {
        let content = "hello world";
        let pattern = r"xyz";
        let matches = find_regex_matches(content, pattern).unwrap();
        assert!(matches.is_empty());
    }

    #[test]
    fn test_regex_invalid_pattern() {
        let content = "hello";
        let pattern = r"[invalid";
        let result = find_regex_matches(content, pattern);
        assert!(result.is_err());
    }

    #[test]
    fn test_regex_context_padding() {
        let content = "aaaaaaaaaa_PREFIX_match_here_SUFFIX_bbbbbbbbbb";
        let pattern = r"match_here";
        let matches = find_regex_matches(content, pattern).unwrap();
        assert_eq!(matches.len(), 1);
        assert!(matches[0].snippet.contains("PREFIX"));
        assert!(matches[0].snippet.contains("SUFFIX"));
    }

    #[test]
    fn test_regex_max_matches_cap() {
        let content = "ab ".repeat(MAX_MATCHES_PER_SEARCH + 10);
        let pattern = r"ab";
        let matches = find_regex_matches(content.trim(), pattern).unwrap();
        assert_eq!(matches.len(), MAX_MATCHES_PER_SEARCH);
    }

    #[test]
    fn test_regex_multibyte_utf8_boundary() {
        let content = "价格是 hello 世界";
        let pattern = r"hello";
        let matches = find_regex_matches(content, pattern).unwrap();
        assert_eq!(matches.len(), 1);
    }
}
