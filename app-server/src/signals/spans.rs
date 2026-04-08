use anyhow::Result;
use chrono::DateTime;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fmt::Write;
use uuid::Uuid;

use crate::ch::spans::CHSpan;

use super::utils::{clean_whitespace, strip_noise, try_parse_json};

const TRUNCATE_THRESHOLD: usize = 1024;
/// Max chars to keep per message string in LLM span inputs.
const LLM_MESSAGE_MAX_CHARS: usize = 3000;
/// Hard cap on total serialized LLM input size after per-string truncation.
const LLM_INPUT_TOTAL_MAX_CHARS: usize = 8192;

/// Minimum unique words in tool input for content-overlap dedup to be attempted.
const TOOL_DEDUP_MIN_WORDS: usize = 3;
/// Fraction of tool input words that must appear in an LLM output to count as a match.
const TOOL_DEDUP_OVERLAP_THRESHOLD: f64 = 0.75;

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
    pub input_truncated: bool,
    pub output_truncated: bool,
    pub status: String,
    pub parent: Option<String>,
    pub exception: Option<String>,
    pub system_prompt_ref: Option<String>,
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

fn is_empty_raw(s: &str) -> bool {
    s.is_empty() || s == "null" || s == "\"\"" || s == "''"
}

/// Get span type string
pub fn get_span_type(span_type: u8) -> &'static str {
    match span_type {
        1 => "llm",
        6 => "tool",
        _ => "default",
    }
}

fn stringify_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

/// Stringify an LLM input Value (array of messages) with per-string truncation.
fn truncate_llm_input(value: &Value, truncated: &mut bool) -> String {
    let truncated_value = match value {
        Value::Array(messages) => Value::Array(
            messages
                .iter()
                .map(|m| truncate_message_strings(m, truncated))
                .collect(),
        ),
        _ => value.clone(),
    };
    stringify_value(&truncated_value)
}

fn truncate_str(s: String, max: usize, truncated: &mut bool) -> String {
    let char_count = s.chars().count();
    if char_count <= max {
        return s;
    }
    *truncated = true;
    let kept: String = s.chars().take(max).collect();
    format!("{}<truncated {} more chars>", kept, char_count - max)
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

/// Extract exception attributes from span events.
/// Events are stored as `(timestamp, name, attributes)` tuples; we look for `name == "exception"`.
pub fn extract_exception_from_events(events: &[(i64, String, String)]) -> Option<Value> {
    events
        .iter()
        .find(|(_, name, _)| name == "exception")
        .map(|(_, _, attrs)| try_parse_json(attrs))
        .filter(|v| !v.is_null())
}

/// Extract unique lowercase alphanumeric tokens (length >= 2) from a string.
fn extract_words(s: &str) -> HashSet<String> {
    s.split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|w| w.len() >= 2)
        .map(|w| w.to_lowercase())
        .collect()
}

/// Compute the fraction of `needle_words` that appear in `haystack_words`.
/// Returns 0.0 if `needle_words` has fewer than `TOOL_DEDUP_MIN_WORDS` entries.
fn content_overlap_score(needle_words: &HashSet<String>, haystack_words: &HashSet<String>) -> f64 {
    if needle_words.len() < TOOL_DEDUP_MIN_WORDS {
        return 0.0;
    }
    let matched = needle_words
        .iter()
        .filter(|w| haystack_words.contains(*w))
        .count();
    matched as f64 / needle_words.len() as f64
}

// Re-export from utils for backwards compatibility
pub use super::utils::hash_system_prompt;

/// Extract the system message from a parsed LLM input message array.
/// Returns `(system_text, remaining_messages)` if a `role: "system"` message is found.
pub fn extract_system_message(parsed: &Value) -> Option<(String, Value)> {
    let messages = parsed.as_array()?;
    let sys_idx = messages.iter().position(|m| {
        m.get("role")
            .and_then(|r| r.as_str())
            .is_some_and(|r| r == "system")
    })?;
    let sys_msg = &messages[sys_idx];
    let content_val = sys_msg.get("content");
    let sys_text = content_val
        // "content": "plain string" (OpenAI format)
        .and_then(|c| c.as_str().map(|s| s.to_string()))
        // "content": [{"text": "...", "type": "text"}, ...] (Anthropic format)
        .or_else(|| {
            content_val
                .and_then(|c| c.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|block| block.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .filter(|s| !s.is_empty())
        })
        // "parts": [{"text": "..."}] (Gemini format)
        .or_else(|| {
            sys_msg
                .get("parts")
                .and_then(|p| p.as_array())
                .and_then(|arr| arr.first())
                .and_then(|p| p.get("text"))
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();
    if sys_text.is_empty() {
        return None;
    }
    let remaining: Vec<Value> = messages
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != sys_idx)
        .map(|(_, m)| m.clone())
        .collect();
    Some((sys_text, Value::Array(remaining)))
}

/// Scan all LLM spans and extract unique system prompts.
/// Returns a map of `hash -> full_system_prompt_text` for all unique system prompts found.
#[allow(dead_code)]
pub fn extract_system_prompts(ch_spans: &[CHSpan]) -> HashMap<String, String> {
    let mut result: HashMap<String, String> = HashMap::new();
    for span in ch_spans {
        if span.span_type != 1 {
            continue;
        }
        let parsed = try_parse_json(&strip_noise(&span.input));
        if let Some((sys_text, _)) = extract_system_message(&parsed) {
            let hash = hash_system_prompt(&sys_text);
            result.entry(hash).or_insert(sys_text);
        }
    }
    result
}

#[derive(Debug)]
pub struct ExtractedSystemPrompt {
    pub text: String,
    pub path: String,
}

/// Scan all LLM spans and extract unique system prompts with their span paths.
/// Returns a map of `hash -> ExtractedSystemPrompt` for all unique system prompts found.
/// When the same prompt appears at multiple paths, the first occurrence's path is kept.
pub fn extract_system_prompts_with_paths(
    ch_spans: &[CHSpan],
) -> HashMap<String, ExtractedSystemPrompt> {
    let mut result: HashMap<String, ExtractedSystemPrompt> = HashMap::new();
    for span in ch_spans {
        if span.span_type != 1 {
            continue;
        }
        let parsed = try_parse_json(&span.input);
        if let Some((sys_text, _)) = extract_system_message(&parsed) {
            let hash = hash_system_prompt(&sys_text);
            result.entry(hash).or_insert_with(|| ExtractedSystemPrompt {
                text: sys_text,
                path: span.path.clone(),
            });
        }
    }
    result
}

/// Compress span content based on type and occurrence.
/// Spans are identified by the last 6 hex chars of their UUID, which is stable
/// across iterations regardless of span arrival order.
///
/// `system_prompt_summaries` maps system prompt hash -> compressed summary.
/// When provided, system messages are extracted from LLM inputs and replaced
/// with a `system_prompt: sp_XXXX` reference. Summaries appear in the preamble.
///
/// Optimizations applied:
/// - Default spans with empty input AND output are fully excluded.
/// - Tool span inputs that duplicate a preceding LLM sibling's output are
///   replaced with a `<from_llm_output span_id='...'>` reference.
/// - System prompts in LLM inputs are extracted and replaced with references.
pub fn compress_span_content(
    ch_spans: &[CHSpan],
    system_prompt_summaries: &HashMap<String, String>,
) -> Vec<CompressedSpan> {
    let span_uuid_to_short: HashMap<Uuid, String> = ch_spans
        .iter()
        .map(|span| (span.span_id, span_short_id(&span.span_id)))
        .collect();

    // For tool-input dedup: track all LLM span outputs (as word sets) per parent.
    // When a tool span's input words overlap sufficiently with an LLM sibling's
    // output words, we replace the tool input with a reference.
    let mut parent_llm_outputs: HashMap<Uuid, Vec<(String, HashSet<String>)>> = HashMap::new();

    let mut seen_llm_paths: HashSet<String> = HashSet::new();

    ch_spans
        .iter()
        .filter_map(|ch_span| {
            let is_llm = ch_span.span_type == 1;
            let is_tool = ch_span.span_type == 6;
            let is_default = !is_llm && !is_tool;

            let has_exception = extract_exception_from_events(&ch_span.events).is_some();

            // Exclude default spans with empty input and output, unless they have an exception
            if is_default
                && is_empty_raw(&ch_span.input)
                && is_empty_raw(&ch_span.output)
                && !has_exception
            {
                return None;
            }

            let path = ch_span.path.clone();
            let duration_ns = ch_span.end_time - ch_span.start_time;
            let duration_secs = duration_ns as f64 / 1_000_000_000.0;
            let short_id = span_short_id(&ch_span.span_id);

            let parent = if ch_span.parent_span_id.is_nil() || ch_span.parent_span_id == Uuid::nil()
            {
                None
            } else {
                span_uuid_to_short.get(&ch_span.parent_span_id).cloned()
            };

            let mut input_truncated = false;
            let mut output_truncated = false;

            let mut sys_prompt_ref: Option<String> = None;

            let (input, output) = if is_llm {
                let cleaned_output = clean_whitespace(&strip_noise(&ch_span.output));
                let output_words = extract_words(&cleaned_output);
                parent_llm_outputs
                    .entry(ch_span.parent_span_id)
                    .or_default()
                    .push((short_id.clone(), output_words));

                let output =
                    truncate_str(cleaned_output, TRUNCATE_THRESHOLD, &mut output_truncated);

                if seen_llm_paths.contains(&path) {
                    (
                        format!("<omitted {} chars>", ch_span.input.chars().count()),
                        output,
                    )
                } else {
                    seen_llm_paths.insert(path.clone());
                    let parsed = try_parse_json(&strip_noise(&ch_span.input));

                    let input_to_process =
                        if let Some((sys_text, remaining)) = extract_system_message(&parsed) {
                            let hash = hash_system_prompt(&sys_text);
                            if system_prompt_summaries.contains_key(&hash) {
                                sys_prompt_ref = Some(format!("sp_{}", hash));
                                remaining
                            } else {
                                parsed
                            }
                        } else {
                            parsed
                        };

                    let llm_str = truncate_llm_input(&input_to_process, &mut input_truncated);
                    let input_str = clean_whitespace(&llm_str);
                    let input_str =
                        truncate_str(input_str, LLM_INPUT_TOTAL_MAX_CHARS, &mut input_truncated);
                    (input_str, output)
                }
            } else if is_tool {
                let output_raw = strip_noise(&ch_span.output);

                let input = {
                    let input_raw = strip_noise(&ch_span.input);
                    if is_empty_raw(&input_raw) {
                        "<empty>".to_string()
                    } else {
                        let input_words = extract_words(&input_raw);
                        let matched_llm =
                            parent_llm_outputs
                                .get(&ch_span.parent_span_id)
                                .and_then(|llms| {
                                    llms.iter().rev().find_map(|(llm_id, llm_words)| {
                                        let score = content_overlap_score(&input_words, llm_words);
                                        if score >= TOOL_DEDUP_OVERLAP_THRESHOLD {
                                            Some(llm_id.clone())
                                        } else {
                                            None
                                        }
                                    })
                                });

                        if let Some(llm_id) = matched_llm {
                            format!("<from_llm_output span_id='{}'>", llm_id)
                        } else {
                            clean_whitespace(&truncate_str(
                                input_raw,
                                TRUNCATE_THRESHOLD,
                                &mut input_truncated,
                            ))
                        }
                    }
                };

                let output = if is_empty_raw(&output_raw) {
                    "<empty>".to_string()
                } else {
                    clean_whitespace(&truncate_str(
                        output_raw,
                        TRUNCATE_THRESHOLD,
                        &mut output_truncated,
                    ))
                };

                (input, output)
            } else {
                let input = omit_or_empty(&ch_span.input);
                let output = omit_or_empty(&ch_span.output);
                (input, output)
            };

            let exception =
                extract_exception_from_events(&ch_span.events).map(|v| stringify_value(&v));

            Some(CompressedSpan {
                id: short_id,
                name: ch_span.name.clone(),
                path: path.clone(),
                span_type: get_span_type(ch_span.span_type).to_string(),
                start: format_ns_timestamp(ch_span.start_time),
                duration: duration_secs,
                total_cost: ch_span.total_cost,
                total_tokens: ch_span.total_tokens,
                input,
                output,
                input_truncated,
                output_truncated,
                status: if ch_span.status == "<null>" || ch_span.status.is_empty() {
                    String::new()
                } else {
                    ch_span.status.clone()
                },
                parent,
                exception,
                system_prompt_ref: sys_prompt_ref,
            })
        })
        .collect()
}

fn spans_to_string(
    spans: &[CompressedSpan],
    system_prompt_summaries: &HashMap<String, String>,
) -> String {
    let mut out = String::new();

    // Emit system prompts preamble if any were extracted
    let used_refs: BTreeSet<&str> = spans
        .iter()
        .filter_map(|s| s.system_prompt_ref.as_deref())
        .collect();
    if !used_refs.is_empty() {
        let _ = writeln!(out, "system_prompts:");
        for ref_id in &used_refs {
            let hash = ref_id.strip_prefix("sp_").unwrap_or(ref_id);
            if let Some(summary) = system_prompt_summaries.get(hash) {
                let _ = writeln!(out, "  {}: {}", ref_id, summary);
            }
        }
        let _ = writeln!(out);
    }

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
            let _ = writeln!(out, "  parent: <none>");
        }
        if !span.status.is_empty() {
            let _ = writeln!(out, "  status: {}", span.status);
        }
        if let Some(ref_id) = &span.system_prompt_ref {
            let _ = writeln!(out, "  system_prompt: {}", ref_id);
        }
        if span.input_truncated {
            let _ = writeln!(out, "  input_truncated: true");
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
#[tracing::instrument(skip_all, fields(project_id, trace_id))]
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

/// Query trace spans from ClickHouse (public for use in process_run).
pub async fn get_trace_ch_spans(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<Vec<CHSpan>> {
    get_trace_spans(clickhouse, project_id, trace_id).await
}

/// Build the trace structure string from pre-fetched spans and system prompt summaries.
pub fn build_trace_structure_string(
    ch_spans: &[CHSpan],
    trace_id: Uuid,
    system_prompt_summaries: &HashMap<String, String>,
) -> String {
    if ch_spans.is_empty() {
        return format!(
            "No spans found for trace {}. Either the trace does not exist in this project or there are no spans in the trace.",
            trace_id
        );
    }

    let compressed_spans = compress_span_content(ch_spans, system_prompt_summaries);
    let trace_str = spans_to_string(&compressed_spans, system_prompt_summaries);

    format!(
        "Here are all spans of the trace:\n<spans>\n{}</spans>\n",
        trace_str
    )
}

/// Get trace structure as YAML of all compressed spans.
/// This is the simple path without system prompt summarization (used by MCP, trace chat).
pub async fn get_trace_structure_as_string(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<String> {
    let ch_spans = get_trace_spans(clickhouse, project_id, trace_id).await?;
    let empty_summaries = HashMap::new();
    Ok(build_trace_structure_string(
        &ch_spans,
        trace_id,
        &empty_summaries,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_span(
        span_id: Uuid,
        parent_span_id: Uuid,
        name: &str,
        span_type: u8,
        start_time: i64,
        input: &str,
        output: &str,
    ) -> CHSpan {
        CHSpan {
            span_id,
            name: name.to_string(),
            span_type,
            start_time,
            end_time: start_time + 1_000_000_000,
            input_cost: 0.0,
            output_cost: 0.0,
            total_cost: 0.0,
            model: String::new(),
            session_id: String::new(),
            project_id: Uuid::nil(),
            trace_id: Uuid::nil(),
            provider: String::new(),
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            user_id: String::new(),
            path: name.to_string(),
            input: input.to_string(),
            output: output.to_string(),
            size_bytes: 0,
            status: String::new(),
            attributes: String::new(),
            request_model: String::new(),
            response_model: String::new(),
            parent_span_id,
            trace_metadata: String::new(),
            trace_type: 0,
            tags_array: vec![],
            events: vec![],
        }
    }

    // ===================================================================
    // extract_words
    // ===================================================================

    #[test]
    fn test_extract_words_json() {
        let words = extract_words(r#"{"action":"click","params":{"index":42}}"#);
        assert!(words.contains("action"));
        assert!(words.contains("click"));
        assert!(words.contains("params"));
        assert!(words.contains("index"));
        assert!(words.contains("42"));
    }

    #[test]
    fn test_extract_words_skips_single_char() {
        let words = extract_words(r#"{"a": 1, "bb": 2}"#);
        assert!(!words.contains("a"));
        assert!(!words.contains("1"));
        assert!(words.contains("bb"));
    }

    #[test]
    fn test_extract_words_case_insensitive() {
        let words = extract_words("Hello WORLD FooBar");
        assert!(words.contains("hello"));
        assert!(words.contains("world"));
        assert!(words.contains("foobar"));
    }

    // ===================================================================
    // content_overlap_score
    // ===================================================================

    #[test]
    fn test_overlap_full_match() {
        let needle: HashSet<String> = ["action", "click", "index"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let haystack: HashSet<String> = ["action", "click", "index", "extra", "words"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(content_overlap_score(&needle, &haystack), 1.0);
    }

    #[test]
    fn test_overlap_partial_match() {
        let needle: HashSet<String> = ["action", "click", "params", "index"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let haystack: HashSet<String> = ["action", "click", "index"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(content_overlap_score(&needle, &haystack), 0.75);
    }

    #[test]
    fn test_overlap_below_min_words() {
        let needle: HashSet<String> = ["ab", "cd"].iter().map(|s| s.to_string()).collect();
        let haystack: HashSet<String> = ["ab", "cd"].iter().map(|s| s.to_string()).collect();
        assert_eq!(content_overlap_score(&needle, &haystack), 0.0);
    }

    #[test]
    fn test_overlap_no_match() {
        let needle: HashSet<String> = ["foo", "bar", "baz"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let haystack: HashSet<String> = ["alpha", "beta", "gamma"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(content_overlap_score(&needle, &haystack), 0.0);
    }

    // ===================================================================
    // compress_span_content — empty default span exclusion
    // ===================================================================

    #[test]
    fn test_empty_default_spans_excluded() {
        let parent_id = Uuid::new_v4();
        let spans = vec![
            make_span(
                parent_id,
                Uuid::nil(),
                "agent",
                0,
                1000,
                "\"hello\"",
                "\"world\"",
            ),
            make_span(Uuid::new_v4(), parent_id, "agent.step", 0, 2000, "", ""),
            make_span(
                Uuid::new_v4(),
                parent_id,
                "null_wrapper",
                0,
                3000,
                "null",
                "null",
            ),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "agent");
    }

    #[test]
    fn test_empty_default_span_with_exception_kept() {
        let parent_id = Uuid::new_v4();
        let span_id = Uuid::new_v4();
        let mut span = make_span(span_id, parent_id, "failing_step", 0, 2000, "", "");
        span.events = vec![(
            2_500_000_000,
            "exception".to_string(),
            r#"{"exception.message":"connection timeout"}"#.to_string(),
        )];

        let spans = vec![
            make_span(
                parent_id,
                Uuid::nil(),
                "agent",
                0,
                1000,
                "\"run\"",
                "\"ok\"",
            ),
            span,
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        assert_eq!(result.len(), 2);
        let kept = result.iter().find(|s| s.name == "failing_step").unwrap();
        assert!(kept.exception.is_some());
    }

    #[test]
    fn test_default_span_with_content_kept() {
        let spans = vec![
            make_span(
                Uuid::new_v4(),
                Uuid::nil(),
                "agent",
                0,
                1000,
                "\"data\"",
                "\"result\"",
            ),
            make_span(
                Uuid::new_v4(),
                Uuid::nil(),
                "wrapper",
                0,
                2000,
                "\"input\"",
                "",
            ),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        assert_eq!(result.len(), 2);
    }

    // ===================================================================
    // compress_span_content — tool input dedup via content overlap
    // ===================================================================

    #[test]
    fn test_done_tool_dedup_realistic() {
        let parent_id = Uuid::new_v4();
        let llm_id = Uuid::new_v4();

        let llm_output = r#"[{"content":{"parts":[{"text":"{ \"thinking\": \"I have gathered info for F2, Nox Metals, and Blue.\", \"action\": [ { \"done\": { \"text\": \"Here are summaries for 3 startups from the Y Combinator Summer 2025 batch: 1. F2 - AI platform for private markets investors, New York. 2. Nox Metals - AI-powered metals supplier, Detroit. 3. Blue - voice assistant USB-C dongle, controls every app on your phone.\", \"success\": true } } ] }"}],"role":"model"}}]"#;

        let tool_input = r#"{"action":"done","params":{"text":"Here are summaries for 3 startups from the Y Combinator Summer 2025 batch: 1. F2 - AI platform for private markets investors, New York. 2. Nox Metals - AI-powered metals supplier, Detroit. 3. Blue - voice assistant USB-C dongle, controls every app on your phone.","success":true,"files_to_display":[]}}"#;

        let spans = vec![
            make_span(
                llm_id,
                parent_id,
                "gemini.generate_content",
                1,
                1000,
                r#"[{"role":"user","content":"summarize"}]"#,
                llm_output,
            ),
            make_span(Uuid::new_v4(), parent_id, "done", 6, 2000, tool_input, "{}"),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        let tool_span = result.iter().find(|s| s.name == "done").unwrap();

        assert!(
            tool_span.input.contains("<from_llm_output"),
            "done tool with high content overlap should be deduped, got: {}",
            tool_span.input
        );
        assert!(tool_span.input.contains(&span_short_id(&llm_id)));
    }

    #[test]
    fn test_go_back_tool_dedup_realistic() {
        let parent_id = Uuid::new_v4();
        let llm_id = Uuid::new_v4();

        let llm_output = r#"[{"content":{"parts":[{"text":"{ \"thinking\": \"I need to go back to the companies list.\", \"action\": [ { \"go_back\": { \"description\": \"Returning to the Summer 2025 companies list to find more startups.\" } } ] }"}],"role":"model"}}]"#;

        let tool_input = r#"{"action":"go_back","params":{"description":"Returning to the Summer 2025 companies list to find more startups."}}"#;

        let spans = vec![
            make_span(
                llm_id,
                parent_id,
                "gemini.generate_content",
                1,
                1000,
                r#"[{"role":"user","content":"go back"}]"#,
                llm_output,
            ),
            make_span(
                Uuid::new_v4(),
                parent_id,
                "go_back",
                6,
                2000,
                tool_input,
                "{}",
            ),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        let tool_span = result.iter().find(|s| s.name == "go_back").unwrap();

        assert!(
            tool_span.input.contains("<from_llm_output"),
            "go_back tool should be deduped, got: {}",
            tool_span.input
        );
    }

    #[test]
    fn test_tool_input_kept_when_no_overlap() {
        let parent_id = Uuid::new_v4();
        let llm_id = Uuid::new_v4();

        let llm_output =
            r#"[{"content":{"parts":[{"text":"The weather is sunny today"}],"role":"model"}}]"#;

        let tool_input = r#"{"database":"postgres","query":"SELECT * FROM users WHERE active = true","limit":100}"#;

        let spans = vec![
            make_span(
                llm_id,
                parent_id,
                "gemini.generate_content",
                1,
                1000,
                r#"[{"role":"user","content":"hi"}]"#,
                llm_output,
            ),
            make_span(
                Uuid::new_v4(),
                parent_id,
                "db_query",
                6,
                2000,
                tool_input,
                "rows",
            ),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        let tool_span = result.iter().find(|s| s.name == "db_query").unwrap();

        assert!(
            !tool_span.input.contains("<from_llm_output"),
            "unrelated tool input should NOT be deduped, got: {}",
            tool_span.input
        );
    }

    #[test]
    fn test_tool_input_kept_when_no_preceding_llm() {
        let parent_id = Uuid::new_v4();

        let spans = vec![
            make_span(
                parent_id,
                Uuid::nil(),
                "agent",
                0,
                1000,
                "\"run\"",
                "\"done\"",
            ),
            make_span(
                Uuid::new_v4(),
                parent_id,
                "navigate",
                6,
                2000,
                r#"{"action":"navigate","params":{"url":"https://example.com"}}"#,
                r#"{"extracted_content":"Navigated to https://example.com"}"#,
            ),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        let tool_span = result.iter().find(|s| s.name == "navigate").unwrap();

        assert!(
            !tool_span.input.contains("<from_llm_output"),
            "tool without LLM sibling should keep its input, got: {}",
            tool_span.input
        );
    }

    #[test]
    fn test_small_tool_input_not_deduped() {
        let parent_id = Uuid::new_v4();
        let llm_id = Uuid::new_v4();

        let llm_output = r#"[{"content":{"parts":[{"text":"{ \"action\": [ { \"click\": { \"index\": 42 } } ] }"}],"role":"model"}}]"#;

        // Only 2 meaningful words after filtering (below TOOL_DEDUP_MIN_WORDS)
        let tool_input = r#"{"x": 42}"#;

        let spans = vec![
            make_span(
                llm_id,
                parent_id,
                "gemini",
                1,
                1000,
                r#"[{"role":"user","content":"hi"}]"#,
                llm_output,
            ),
            make_span(
                Uuid::new_v4(),
                parent_id,
                "click",
                6,
                2000,
                tool_input,
                "ok",
            ),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        let tool_span = result.iter().find(|s| s.name == "click").unwrap();

        assert!(
            !tool_span.input.contains("<from_llm_output"),
            "tool with too few words should not be deduped, got: {}",
            tool_span.input
        );
    }

    #[test]
    fn test_parallel_llms_match_correct_one() {
        let parent_id = Uuid::new_v4();
        let llm_a = Uuid::new_v4();
        let llm_b = Uuid::new_v4();

        let llm_a_output = r#"{"action":"search_database","query":"SELECT name FROM startups WHERE batch = 'S25'","limit":10}"#;
        let llm_b_output = r#"{"action":"send_email","recipient":"user@example.com","subject":"YC Report","body":"Here is the summary of startups."}"#;

        let tool_a_input = r#"{"action":"search_database","query":"SELECT name FROM startups WHERE batch = 'S25'","limit":10}"#;
        let tool_b_input = r#"{"action":"send_email","recipient":"user@example.com","subject":"YC Report","body":"Here is the summary of startups."}"#;

        let spans = vec![
            make_span(
                llm_a,
                parent_id,
                "llm_a",
                1,
                1000,
                r#"[{"role":"user","content":"a"}]"#,
                llm_a_output,
            ),
            make_span(
                llm_b,
                parent_id,
                "llm_b",
                1,
                2000,
                r#"[{"role":"user","content":"b"}]"#,
                llm_b_output,
            ),
            make_span(
                Uuid::new_v4(),
                parent_id,
                "search_db",
                6,
                3000,
                tool_a_input,
                "results",
            ),
            make_span(
                Uuid::new_v4(),
                parent_id,
                "send_mail",
                6,
                4000,
                tool_b_input,
                "sent",
            ),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        let search_tool = result.iter().find(|s| s.name == "search_db").unwrap();
        let email_tool = result.iter().find(|s| s.name == "send_mail").unwrap();

        assert!(
            search_tool.input.contains(&span_short_id(&llm_a)),
            "search tool should reference LLM A, got: {}",
            search_tool.input
        );
        assert!(
            email_tool.input.contains(&span_short_id(&llm_b)),
            "email tool should reference LLM B, got: {}",
            email_tool.input
        );
    }

    #[test]
    fn test_nested_agents_scope_correctly() {
        let outer_parent = Uuid::new_v4();
        let inner_parent = Uuid::new_v4();
        let outer_llm = Uuid::new_v4();
        let inner_llm = Uuid::new_v4();

        let shared_content = r#"{"action":"analyze","data":"revenue figures Q1 2025","format":"summary","include_charts":true}"#;

        let spans = vec![
            make_span(
                outer_llm,
                outer_parent,
                "outer_llm",
                1,
                1000,
                r#"[{"role":"user","content":"a"}]"#,
                shared_content,
            ),
            make_span(
                inner_llm,
                inner_parent,
                "inner_llm",
                1,
                2000,
                r#"[{"role":"user","content":"b"}]"#,
                shared_content,
            ),
            make_span(
                Uuid::new_v4(),
                outer_parent,
                "outer_tool",
                6,
                3000,
                shared_content,
                "res",
            ),
            make_span(
                Uuid::new_v4(),
                inner_parent,
                "inner_tool",
                6,
                4000,
                shared_content,
                "res",
            ),
        ];

        let no_summaries = HashMap::new();
        let result = compress_span_content(&spans, &no_summaries);
        let outer_tool = result.iter().find(|s| s.name == "outer_tool").unwrap();
        let inner_tool = result.iter().find(|s| s.name == "inner_tool").unwrap();

        assert!(outer_tool.input.contains(&span_short_id(&outer_llm)));
        assert!(inner_tool.input.contains(&span_short_id(&inner_llm)));
    }

    // ===================================================================
    // extract_system_message
    // ===================================================================

    #[test]
    fn test_extract_system_message_openai_format() {
        let input = serde_json::json!([
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello"}
        ]);
        let (sys_text, remaining) = extract_system_message(&input).unwrap();
        assert_eq!(sys_text, "You are a helpful assistant.");
        assert_eq!(remaining.as_array().unwrap().len(), 1);
        assert_eq!(remaining[0]["role"], "user");
    }

    #[test]
    fn test_extract_system_message_gemini_parts_format() {
        let input = serde_json::json!([
            {"role": "system", "parts": [{"text": "You are a safety-focused agent."}]},
            {"role": "user", "parts": [{"text": "Do something"}]}
        ]);
        let (sys_text, remaining) = extract_system_message(&input).unwrap();
        assert_eq!(sys_text, "You are a safety-focused agent.");
        assert_eq!(remaining.as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_extract_system_message_none_when_absent() {
        let input = serde_json::json!([
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"}
        ]);
        assert!(extract_system_message(&input).is_none());
    }

    #[test]
    fn test_extract_system_message_none_for_non_array() {
        let input = serde_json::json!({"role": "system", "content": "test"});
        assert!(extract_system_message(&input).is_none());
    }

    // ===================================================================
    // hash_system_prompt
    // ===================================================================

    #[test]
    fn test_hash_stability() {
        let hash1 = hash_system_prompt("You are a helpful assistant.");
        let hash2 = hash_system_prompt("You are a helpful assistant.");
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 8);
    }

    #[test]
    fn test_hash_whitespace_normalization() {
        let hash1 = hash_system_prompt("You  are\n a   helpful\tassistant.");
        let hash2 = hash_system_prompt("You are a helpful assistant.");
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_case_normalization() {
        let hash1 = hash_system_prompt("You Are A Helpful Assistant.");
        let hash2 = hash_system_prompt("you are a helpful assistant.");
        assert_eq!(hash1, hash2);
    }

    // ===================================================================
    // extract_system_prompts (full scan)
    // ===================================================================

    #[test]
    fn test_extract_system_prompts_from_trace() {
        let sys_prompt = "You are a customer support agent. Always be polite.";
        let input = format!(
            r#"[{{"role":"system","content":"{}"}},{{"role":"user","content":"Help me"}}]"#,
            sys_prompt
        );
        let spans = vec![
            make_span(
                Uuid::new_v4(),
                Uuid::nil(),
                "llm_call",
                1,
                1000,
                &input,
                "ok",
            ),
            make_span(
                Uuid::new_v4(),
                Uuid::nil(),
                "tool_call",
                6,
                2000,
                "{}",
                "ok",
            ),
        ];

        let extracted = extract_system_prompts(&spans);
        assert_eq!(extracted.len(), 1);
        let (_, text) = extracted.iter().next().unwrap();
        assert_eq!(text, sys_prompt);
    }

    #[test]
    fn test_extract_system_prompts_deduplicates() {
        let sys_prompt = "You are a helpful agent.";
        let input = format!(
            r#"[{{"role":"system","content":"{}"}},{{"role":"user","content":"Hi"}}]"#,
            sys_prompt
        );
        let spans = vec![
            make_span(Uuid::new_v4(), Uuid::nil(), "llm_a", 1, 1000, &input, "a"),
            make_span(Uuid::new_v4(), Uuid::nil(), "llm_b", 1, 2000, &input, "b"),
        ];

        let extracted = extract_system_prompts(&spans);
        assert_eq!(extracted.len(), 1);
    }

    // ===================================================================
    // compress_span_content — system prompt extraction
    // ===================================================================

    #[test]
    fn test_system_prompt_extracted_and_referenced() {
        let sys_prompt = "You are a customer support agent. Always be polite and helpful.";
        let input = format!(
            r#"[{{"role":"system","content":"{}"}},{{"role":"user","content":"Help me"}}]"#,
            sys_prompt
        );
        let hash = hash_system_prompt(sys_prompt);
        let summaries: HashMap<String, String> = [(
            hash.clone(),
            "Customer support agent. Be polite.".to_string(),
        )]
        .into_iter()
        .collect();

        let spans = vec![make_span(
            Uuid::new_v4(),
            Uuid::nil(),
            "openai.chat",
            1,
            1000,
            &input,
            "Sure, I can help!",
        )];

        let result = compress_span_content(&spans, &summaries);
        assert_eq!(result.len(), 1);
        let span = &result[0];
        assert_eq!(span.system_prompt_ref, Some(format!("sp_{}", hash)));
        assert!(
            !span.input.contains("customer support"),
            "system message should be stripped from input, got: {}",
            span.input
        );
        assert!(span.input.contains("Help me"));
    }

    #[test]
    fn test_system_prompt_kept_when_no_summary() {
        let sys_prompt = "You are a customer support agent.";
        let input = format!(
            r#"[{{"role":"system","content":"{}"}},{{"role":"user","content":"Help me"}}]"#,
            sys_prompt
        );

        let no_summaries = HashMap::new();
        let spans = vec![make_span(
            Uuid::new_v4(),
            Uuid::nil(),
            "openai.chat",
            1,
            1000,
            &input,
            "Sure!",
        )];

        let result = compress_span_content(&spans, &no_summaries);
        assert_eq!(result.len(), 1);
        let span = &result[0];
        assert!(span.system_prompt_ref.is_none());
        assert!(span.input.contains("customer support"));
    }

    #[test]
    fn test_system_prompt_preamble_in_output() {
        let sys_prompt = "You are a safety-focused AI agent with strict rules.";
        let input = format!(
            r#"[{{"role":"system","content":"{}"}},{{"role":"user","content":"Do X"}}]"#,
            sys_prompt
        );
        let hash = hash_system_prompt(sys_prompt);
        let summary = "Safety-focused AI agent with strict rules.".to_string();
        let summaries: HashMap<String, String> =
            [(hash.clone(), summary.clone())].into_iter().collect();

        let spans = vec![make_span(
            Uuid::new_v4(),
            Uuid::nil(),
            "llm",
            1,
            1000,
            &input,
            "ok",
        )];

        let compressed = compress_span_content(&spans, &summaries);
        let output = spans_to_string(&compressed, &summaries);
        assert!(
            output.contains("system_prompts:"),
            "output should contain system_prompts section, got:\n{}",
            output
        );
        assert!(
            output.contains(&format!("sp_{}", hash)),
            "output should contain the ref id"
        );
        assert!(
            output.contains(&summary),
            "output should contain the summary"
        );
    }
}
