use anyhow::Result;
use chrono::Utc;
use regex::Regex;
use serde_json::Value;
use sha3::{Digest, Sha3_256};
use std::{collections::HashMap, sync::Arc, sync::LazyLock};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::{
        events::{Event, EventSource},
        spans::{Span, SpanType},
    },
    mq::{MessageQueue, MessageQueueTrait},
    signals::provider::models::ProviderRequest,
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY, spans::SpanAttributes},
};

static BASE64_IMAGE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:/9j/|iVBORw0KGgo|R0lGODlh|UklGR|PHN2Zz)[A-Za-z0-9+/=_-]{64,}"#).unwrap()
});

static SIGNATURE_FIELD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"("(?:signature|thought_signature)")\s*:\s*"[^"]*""#).unwrap());

/// Matches signature/thought_signature fields inside nested JSON strings where
/// quotes are backslash-escaped (e.g. `\"signature\":\"...\"`).
static SIGNATURE_FIELD_ESCAPED_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(\\"(?:signature|thought_signature)\\")\s*:\s*\\"[^"\\]*\\""#).unwrap()
});

/// Strip base64 images and signature/thought_signature values from raw
/// ClickHouse span content. Does NOT touch whitespace — use
/// `clean_value_whitespace` (after JSON parsing) or `clean_raw_whitespace`
/// (for non-JSON contexts like search) separately.
pub fn strip_noise(raw: &str) -> String {
    let without_images = BASE64_IMAGE_RE.replace_all(raw, "[base64 image omitted]");
    let without_sigs = SIGNATURE_FIELD_RE
        .replace_all(&without_images, r#"$1:"[signature omitted]""#);
    SIGNATURE_FIELD_ESCAPED_RE
        .replace_all(&without_sigs, r##"$1:\"[signature omitted]\""##)
        .into_owned()
}

/// Clean a string by collapsing whitespace (actual and literal escape
/// sequences) and stripping backslashes (nested JSON escaping noise).
/// Works on both raw strings (with literal `\n`/`\t`/`\r`) and stringified
/// parsed JSON values (with actual newline/tab/CR characters).
pub fn clean_whitespace(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut in_ws = false;
    let mut chars = s.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\n' || ch == '\t' || ch == '\r' || ch == ' ' {
            if !in_ws {
                result.push(' ');
                in_ws = true;
            }
        } else if ch == '\\' {
            // Literal escape sequence (\n, \t, \r) → treat as whitespace
            if let Some(&next) = chars.peek() {
                if next == 'n' || next == 't' || next == 'r' {
                    chars.next();
                    if !in_ws {
                        result.push(' ');
                        in_ws = true;
                    }
                    continue;
                }
            }
            // All other backslashes (\", \\, \/) → skip (JSON escaping noise)
        } else {
            result.push(ch);
            in_ws = false;
        }
    }
    result
}

/// Build the span input value from a ProviderRequest by combining contents
/// with the system instruction (relabeled as role "system") prepended.
pub fn request_to_span_input(request: &ProviderRequest) -> Value {
    let mut contents = request.contents.clone();
    if let Some(mut sys) = request.system_instruction.clone() {
        sys.role = Some("system".to_string());
        contents.insert(0, sys);
    }
    serde_json::json!(contents)
}

/// Convert ProviderRequest tools into the `ai.prompt.tools` attribute format.
pub fn request_to_tools_attr(request: &ProviderRequest) -> Option<Value> {
    let tools = request.tools.as_ref()?;
    let tool_array: Vec<Value> = tools
        .iter()
        .flat_map(|t| &t.function_declarations)
        .map(|f| {
            serde_json::json!({
                "type": "function",
                "name": f.name,
                "description": f.description,
                "parameters": f.parameters,
            })
        })
        .collect();
    if tool_array.is_empty() {
        None
    } else {
        Some(Value::Array(tool_array))
    }
}

#[derive(Debug, Clone)]
pub struct InternalSpan {
    pub name: String,
    pub trace_id: Uuid,
    pub run_id: Uuid,
    pub signal_name: String,
    pub parent_span_id: Option<Uuid>,
    pub span_type: SpanType,
    pub start_time: chrono::DateTime<Utc>,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub input_tokens: Option<i32>,
    pub input_cached_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub model: String,
    pub provider: String,
    pub internal_project_id: Option<Uuid>,
    /// Job IDs associated with this span (may be empty for triggered runs)
    pub job_id: Option<Uuid>,
    pub error: Option<String>,
    pub provider_batch_id: Option<String>,
    pub metadata: Option<HashMap<String, Value>>,
    pub tools: Option<Value>,
}

/// Hash a text to a stable short hex identifier.
/// Normalizes whitespace and lowercases before hashing so minor formatting
/// variations produce the same hash.
pub fn hash_system_prompt(text: &str) -> String {
    let normalized = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    let digest = Sha3_256::digest(normalized.as_bytes());
    format!("{:x}", digest)[..8].to_string()
}

static XML_TAG_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<(\w+)[\s/>]").unwrap());

/// Hash a system prompt by its structural skeleton: first sentence + sorted XML tag names.
/// Resistant to dynamic content inside tags (config values, user context, tool lists)
/// while preserving the stable identity of the prompt template.
pub fn structural_skeleton_hash(text: &str) -> String {
    // Extract first sentence from original text (before whitespace normalization
    // destroys newline boundaries). Cut at the first '.' or '\n' after 20+ chars.
    let raw_first_sentence = text
        .char_indices()
        .find(|(i, c)| *i >= 20 && (*c == '.' || *c == '\n'))
        .map(|(i, _)| &text[..i])
        .unwrap_or_else(|| {
            let end = text
                .char_indices()
                .nth(200)
                .map(|(i, _)| i)
                .unwrap_or(text.len());
            &text[..end]
        });

    let first_sentence = raw_first_sentence
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();

    // Extract unique XML/HTML tag names (lowercased to match normalized first_sentence)
    let mut tag_names: Vec<String> = XML_TAG_NAME_RE
        .captures_iter(text)
        .map(|cap| cap.get(1).unwrap().as_str().to_lowercase())
        .collect();
    tag_names.sort();
    tag_names.dedup();

    let skeleton = format!("{}|{}", first_sentence, tag_names.join(","));
    let digest = Sha3_256::digest(skeleton.as_bytes());
    format!("{:x}", digest)[..8].to_string()
}

/// Try to parse JSON string, return the parsed value or the original string
pub fn try_parse_json(json_string: &str) -> Value {
    if json_string.is_empty() {
        return Value::Null;
    }
    serde_json::from_str(json_string).unwrap_or_else(|_| Value::String(json_string.to_string()))
}

/// Convert nanoseconds since Unix epoch to DateTime<Utc>
pub fn nanoseconds_to_datetime(nanos: i64) -> chrono::DateTime<chrono::Utc> {
    let secs = nanos / 1_000_000_000;
    let subsec_nanos = (nanos % 1_000_000_000) as u32;
    chrono::DateTime::from_timestamp(secs, subsec_nanos).unwrap_or_else(chrono::Utc::now)
}

/// Convert nanoseconds since Unix epoch to ISO 8601 timestamp string
pub fn nanoseconds_to_iso(nanos: i64) -> String {
    nanoseconds_to_datetime(nanos).to_rfc3339()
}

/// Extract batch ID from Gemini operation name (e.g., "batches/abc123xyz")
pub fn extract_batch_id_from_operation(operation_name: &str) -> Result<String> {
    operation_name
        .split('/')
        .last()
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow::anyhow!("Invalid operation name format: {}", operation_name))
}

/// Replaces span references with markdown URLs in a JSON value.
/// Handles both proper `<span>` XML tags and informal span references.
///
/// Converts short span IDs (last 6 hex chars of UUID) to full UUIDs using span_ids_map.
///
/// Formats handled:
/// - `<span id='a1b2c3' name='openai.chat' />` → `[openai.chat](...?spanId=...)`
/// - `span a1b2c3` → `[span a1b2c3](...?spanId=...)`
/// - `spans a1b2c3, d4e5f6` → `[span a1b2c3](...), [span d4e5f6](...)`
/// - `spans a1b2c3 and d4e5f6` → `[span a1b2c3](...), [span d4e5f6](...)`
pub fn replace_span_tags_with_links(
    attributes: Value,
    span_ids_map: &HashMap<String, Uuid>,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<Value> {
    let json_str = serde_json::to_string(&attributes)?;

    // 1. Replace proper <span id='...' name='...' /> XML tags
    let xml_pattern =
        Regex::new(r#"<span\s+id=['"]([^'"]+)['"]\s+name=['"]([^'"]+)['"][^>]*/?\s*>"#)?;

    let after_xml = xml_pattern.replace_all(&json_str, |caps: &regex::Captures| {
        let short_id = &caps[1];
        let span_name = &caps[2];
        let real_span_id = span_ids_map
            .get(short_id)
            .map(|uuid| uuid.to_string())
            .unwrap_or_else(|| short_id.to_string());
        format!(
            "[{}](https://laminar.sh/project/{}/traces/{}?spanId={}&chat=true)",
            span_name, project_id, trace_id, real_span_id
        )
    });

    // 2. Replace informal "span(s) id1, id2, ..." references (single or comma/and-separated)
    let hex_id_re = Regex::new(r"[0-9a-fA-F]{6}")?;
    let span_ref_pattern = Regex::new(
        r"\bspans?\s+([0-9a-fA-F]{6}(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)[0-9a-fA-F]{6})*)\b",
    )?;

    let after_informal = span_ref_pattern.replace_all(&after_xml, |caps: &regex::Captures| {
        let ids_str = &caps[1];
        let parts: Vec<String> = hex_id_re
            .find_iter(ids_str)
            .map(|m| {
                let short_id = m.as_str().to_lowercase();
                match span_ids_map.get(&short_id) {
                    Some(uuid) => format!(
                        "[span {}](https://laminar.sh/project/{}/traces/{}?spanId={}&chat=true)",
                        short_id, project_id, trace_id, uuid
                    ),
                    None => format!("span {}", short_id),
                }
            })
            .collect();
        parts.join(", ")
    });

    let result: Value = serde_json::from_str(&after_informal)?;
    Ok(result)
}

/// Emits an internal tracing span for observability.
/// This is used for internal tracing of signal workers.
/// Returns Uuid::nil() if internal_project_id is None.
pub async fn emit_internal_span(queue: Arc<MessageQueue>, span: InternalSpan) -> Uuid {
    let project_id = match span.internal_project_id {
        Some(id) => id,
        None => return Uuid::nil(), // Internal tracing disabled
    };

    let span_id = Uuid::new_v4();
    let mut span_name = span.name.clone();

    let mut attrs = HashMap::from([
        (
            "signal.run_id".to_string(),
            Value::String(span.run_id.to_string()),
        ),
        (
            "signal.event_name".to_string(),
            Value::String(span.signal_name),
        ),
    ]);

    // Only add job_ids if non-empty
    if let Some(job_id) = span.job_id {
        attrs.insert(
            "signal.job_id".to_string(),
            Value::String(job_id.to_string()),
        );
    }

    if let Some(tokens) = span.input_tokens {
        attrs.insert(
            "gen_ai.usage.input_tokens".to_string(),
            Value::Number(tokens.into()),
        );
    }
    if let Some(tokens) = span.input_cached_tokens {
        attrs.insert(
            "gen_ai.usage.cache_read_input_tokens".to_string(),
            Value::Number(tokens.into()),
        );
    }
    if let Some(tokens) = span.output_tokens {
        attrs.insert(
            "gen_ai.usage.output_tokens".to_string(),
            Value::Number(tokens.into()),
        );
    }
    if let Some(provider_batch_id) = span.provider_batch_id {
        span_name += ".batch";
        attrs.insert(
            "signal.batch_id".to_string(),
            Value::String(provider_batch_id.to_string()),
        );
        attrs.insert("gen_ai.request.batch".to_string(), Value::Bool(true));
        attrs.insert(
            "lmnr.association.properties.tags".to_string(),
            Value::String("batch".to_string()),
        );
    }

    if let Some(metadata) = span.metadata {
        for (key, value) in metadata {
            attrs.insert(
                format!("lmnr.association.properties.metadata.{}", key),
                value,
            );
        }
    }

    if let Some(tools) = span.tools {
        attrs.insert("ai.prompt.tools".to_string(), tools);
    }

    attrs.insert(
        "gen_ai.request.model".to_string(),
        Value::String(span.model),
    );
    attrs.insert("gen_ai.system".to_string(), Value::String(span.provider));

    if let Some(parent_span_id) = span.parent_span_id {
        attrs.insert(
            "lmnr.span.ids_path".to_string(),
            serde_json::json!([parent_span_id.to_string(), span_id.to_string()]),
        );
        attrs.insert(
            "lmnr.span.path".to_string(),
            serde_json::json!(["signal.run".to_string(), span_name.to_string()]),
            // TODO: Pass parent span name in the message
        );
    } else {
        attrs.insert(
            "lmnr.span.ids_path".to_string(),
            serde_json::json!([span_id.to_string()]),
        );
        attrs.insert(
            "lmnr.span.path".to_string(),
            serde_json::json!([span_name.to_string()]),
        );
    }

    let mut db_span = Span {
        span_id,
        project_id,
        trace_id: span.trace_id,
        parent_span_id: span.parent_span_id,
        name: span_name.to_string(),
        attributes: SpanAttributes::new(attrs),
        input: span.input,
        output: span.output,
        span_type: span.span_type,
        start_time: span.start_time,
        end_time: Utc::now(),
        events: vec![],
        status: Some("OK".to_string()),
        tags: None,
        input_url: None,
        output_url: None,
        size_bytes: 0,
    };

    if let Some(error) = span.error {
        db_span.events.push(Event {
            id: Uuid::new_v4(),
            span_id,
            project_id,
            timestamp: span.start_time,
            name: "exception".to_string(),
            attributes: serde_json::json!({
                "exception.message": error,
            }),
            trace_id: span.trace_id,
            source: EventSource::Code,
        });
    }

    let message = RabbitMqSpanMessage { span: db_span };

    if let Ok(payload) = serde_json::to_vec(&vec![message]) {
        let _ = queue
            .publish(
                &payload,
                OBSERVATIONS_EXCHANGE,
                OBSERVATIONS_ROUTING_KEY,
                None,
            )
            .await;
    }

    span_id
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_noise_png_base64() {
        let raw = r#"{{"text":"hello","random_key":"iVBORw0KGgoAAAANSUhEUgAAB4AAAAPhCAIAAACXJyV9AAAQAElEQVR4nOzdBUAU2x7H8WMQiohdYHd3XLs777W7sLtbr93Y3d3dnddALBRQMVFETEBs8B3Y-_Yuu7Dswg4Cfj-P5505zM7uzs7Msr9z9j_x_f3fCQAAAAAAAAAADGBhkdjwheMLAAAAAAAAAAAUQAANAAAAAAAAAFAEAT","next":"world"}}"#;
        let result = strip_noise(&raw);
        assert!(result.contains("[base64 image omitted]"));
        assert!(!result.contains("iVBORw0KGgo"));
        assert!(result.contains("hello"));
        assert!(result.contains("world"));
    }

    #[test]
    fn test_strip_noise_url_safe_base64() {
        let raw = r#"{"data":"/9j/4AAQSkZJRgABAQ-_Yuu7Dswg4Cfj-P5505zM7uzs7Msr9z9j_x_f3fCQAAAAAAAAAADGBhkdjwheMLAAAAAAAAAAAUQAANAAAAAAAAAFAE"}"#;
        let result = strip_noise(raw);
        assert!(result.contains("[base64 image omitted]"));
        assert!(!result.contains("Yuu7Dswg4Cfj"));
    }

    #[test]
    fn test_strip_noise_raw_base64_with_trailing_url_safe_chars() {
        let prefix = "/9j/".to_string();
        let standard = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let url_safe_tail = "-_Yuu7Dswg4Cfj-P5505zM7uzs";
        let raw = format!(r#"{{"img":"{}{}{}"}}"#, prefix, standard, url_safe_tail);
        let result = strip_noise(&raw);
        assert!(result.contains("[base64 image omitted]"));
        assert!(!result.contains(url_safe_tail));
    }

    #[test]
    fn test_strip_noise_signature_fields() {
        let raw = r#"{"content":"hi","signature":"abc123longHashValue","thought_signature":"def456anotherHash"}"#;
        let result = strip_noise(raw);
        assert!(result.contains(r#""signature":"[signature omitted]""#));
        assert!(result.contains(r#""thought_signature":"[signature omitted]""#));
        assert!(result.contains("hi"));
        assert!(!result.contains("abc123longHashValue"));
        assert!(!result.contains("def456anotherHash"));
    }

    #[test]
    fn test_strip_noise_escaped_signature() {
        let raw = r#"[{"role":"assistant","content":"[{\"type\":\"thinking\",\"thinking\":\"test\",\"signature\":\"EpYCClkIDBgCKkD64fnfxoi6ehwSz8E6sdOJeD6DZe8qq3fylskbvJoII3Q\"}]"}]"#;
        let result = strip_noise(raw);
        assert!(
            result.contains("[signature omitted]"),
            "escaped signature should be omitted, got: {}",
            result
        );
        assert!(!result.contains("EpYCClkIDBgCKkD64fnf"));
    }

    #[test]
    fn test_strip_noise_escaped_thought_signature() {
        let raw = r#"{"content":"[{\"thought_signature\":\"Abc123DefGhi456JklMno789PqrStu012VwxYza345Bcd678Efg\"}]"}"#;
        let result = strip_noise(raw);
        assert!(
            result.contains("[signature omitted]"),
            "escaped thought_signature should be omitted, got: {}",
            result
        );
        assert!(!result.contains("Abc123DefGhi456"));
    }

    #[test]
    fn test_strip_noise_mixed_escaped_and_unescaped_signatures() {
        let raw = r#"{"signature":"topLevelSig","nested":"[{\"signature\":\"nestedSig123456789abcdef\"}]"}"#;
        let result = strip_noise(raw);
        assert!(!result.contains("topLevelSig"));
        assert!(!result.contains("nestedSig123456789abcdef"));
    }

    #[test]
    fn test_strip_noise_no_false_positives() {
        let raw = r#"{"message":"hello world","count":42}"#;
        let result = strip_noise(raw);
        assert_eq!(result, raw);
    }

    #[test]
    fn test_strip_noise_preserves_json_escapes() {
        // strip_noise should NOT touch \n sequences — that's clean_raw_whitespace's job
        let raw = r#"{"text":"hello\nworld"}"#;
        let result = strip_noise(raw);
        assert!(result.contains(r#"\n"#));
    }

    #[test]
    fn test_clean_whitespace_literal_escapes() {
        assert_eq!(
            clean_whitespace(r#"Resources\n\t\tStartup Jobs\n\t\tLog in"#),
            "Resources Startup Jobs Log in"
        );
    }

    #[test]
    fn test_clean_whitespace_actual_whitespace() {
        assert_eq!(clean_whitespace("hello\n\t\tworld\nfoo"), "hello world foo");
    }

    #[test]
    fn test_clean_whitespace_mixed() {
        assert_eq!(
            clean_whitespace(r#"hello\n\n\tworld\r\nfoo"#),
            "hello world foo"
        );
    }

    #[test]
    fn test_clean_whitespace_strips_backslashes() {
        assert_eq!(
            clean_whitespace(r#"said \"hello\" and \\done"#),
            r#"said "hello" and done"#
        );
    }

    #[test]
    fn test_clean_whitespace_nested_json_noise() {
        assert_eq!(
            clean_whitespace(r#"{ \"action\": [ { \"click\": { \"index\": 18 } } ] }"#),
            r#"{ "action": [ { "click": { "index": 18 } } ] }"#
        );
    }

    #[test]
    fn test_clean_whitespace_collapses_spaces() {
        assert_eq!(clean_whitespace("hello   world"), "hello world");
    }

    #[test]
    fn test_strip_noise_multimodal_content() {
        let long_b64 = "A".repeat(200);
        let raw = format!(
            r#"{{"text":"Current screenshot:"}},{{"inline_data":{{"data":"/9j/{}"}}}}"#,
            long_b64
        );
        let result = strip_noise(&raw);
        assert!(result.contains("[base64 image omitted]"));
        assert!(result.contains("Current screenshot:"));
        assert!(!result.contains(&long_b64));
    }

    // ===================================================================
    // replace_span_tags_with_links
    // ===================================================================

    fn make_span_ids_map(pairs: &[(&str, Uuid)]) -> HashMap<String, Uuid> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), *v))
            .collect()
    }

    #[test]
    fn test_span_link_single_span() {
        let uuid = Uuid::new_v4();
        let map = make_span_ids_map(&[("f188ea", uuid)]);
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let input = Value::String("see span f188ea for details".to_string());
        let result = replace_span_tags_with_links(input, &map, pid, tid).unwrap();
        let s = result.as_str().unwrap();
        assert!(s.contains(&format!("[span f188ea]")));
        assert!(s.contains(&format!("spanId={}", uuid)));
    }

    #[test]
    fn test_span_link_plural_single_id() {
        let uuid = Uuid::new_v4();
        let map = make_span_ids_map(&[("f188ea", uuid)]);
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let input = Value::String("spans f188ea shows the error".to_string());
        let result = replace_span_tags_with_links(input, &map, pid, tid).unwrap();
        let s = result.as_str().unwrap();
        assert!(
            s.contains("[span f188ea]"),
            "plural 'spans' with single ID should be linked, got: {}",
            s
        );
    }

    #[test]
    fn test_span_link_comma_separated_list() {
        let u1 = Uuid::new_v4();
        let u2 = Uuid::new_v4();
        let u3 = Uuid::new_v4();
        let map = make_span_ids_map(&[("f188ea", u1), ("1a2b3c", u2), ("4d5e6f", u3)]);
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let input = Value::String("see spans f188ea, 1a2b3c, 4d5e6f for info".to_string());
        let result = replace_span_tags_with_links(input, &map, pid, tid).unwrap();
        let s = result.as_str().unwrap();
        assert!(s.contains(&format!("spanId={}", u1)), "first ID missing: {}", s);
        assert!(s.contains(&format!("spanId={}", u2)), "second ID missing: {}", s);
        assert!(s.contains(&format!("spanId={}", u3)), "third ID missing: {}", s);
    }

    #[test]
    fn test_span_link_and_separated() {
        let u1 = Uuid::new_v4();
        let u2 = Uuid::new_v4();
        let map = make_span_ids_map(&[("aabb11", u1), ("cc22dd", u2)]);
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let input = Value::String("spans aabb11 and cc22dd are relevant".to_string());
        let result = replace_span_tags_with_links(input, &map, pid, tid).unwrap();
        let s = result.as_str().unwrap();
        assert!(s.contains(&format!("spanId={}", u1)), "first ID missing: {}", s);
        assert!(s.contains(&format!("spanId={}", u2)), "second ID missing: {}", s);
    }

    #[test]
    fn test_span_link_oxford_comma() {
        let u1 = Uuid::new_v4();
        let u2 = Uuid::new_v4();
        let u3 = Uuid::new_v4();
        let map = make_span_ids_map(&[("aa11bb", u1), ("cc22dd", u2), ("ee33ff", u3)]);
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let input =
            Value::String("see spans aa11bb, cc22dd, and ee33ff for context".to_string());
        let result = replace_span_tags_with_links(input, &map, pid, tid).unwrap();
        let s = result.as_str().unwrap();
        assert!(s.contains(&format!("spanId={}", u1)), "first: {}", s);
        assert!(s.contains(&format!("spanId={}", u2)), "second: {}", s);
        assert!(s.contains(&format!("spanId={}", u3)), "third: {}", s);
    }

    #[test]
    fn test_span_link_unknown_id_in_list() {
        let u1 = Uuid::new_v4();
        let map = make_span_ids_map(&[("f188ea", u1)]);
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let input = Value::String("spans f188ea, 999999 have issues".to_string());
        let result = replace_span_tags_with_links(input, &map, pid, tid).unwrap();
        let s = result.as_str().unwrap();
        assert!(s.contains(&format!("spanId={}", u1)), "known ID should be linked: {}", s);
        assert!(s.contains("span 999999"), "unknown ID kept as text: {}", s);
        assert!(!s.contains(&format!("999999&chat")), "unknown ID should not be linked: {}", s);
    }

    #[test]
    fn test_span_link_xml_tag_still_works() {
        let uuid = Uuid::new_v4();
        let map = make_span_ids_map(&[("abcdef", uuid)]);
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let input = Value::String("<span id='abcdef' name='openai.chat' />".to_string());
        let result = replace_span_tags_with_links(input, &map, pid, tid).unwrap();
        let s = result.as_str().unwrap();
        assert!(s.contains("[openai.chat]"), "XML tag should produce named link: {}", s);
        assert!(s.contains(&format!("spanId={}", uuid)));
    }

    #[test]
    fn test_structural_skeleton_hash_stable_across_dynamic_content() {
        let prompt_v1 = r#"You are an AI agent designed to automate browser tasks.
<agent_configuration>
Model: browser-use-llm
Proxy: enabled
Vision: enabled
</agent_configuration>
<rules>
Do not fabricate data.
</rules>"#;

        let prompt_v2 = r#"You are an AI agent designed to automate browser tasks.
<agent_configuration>
Model: gpt-4o
Proxy: disabled
Vision: disabled
</agent_configuration>
<rules>
Do not fabricate data.
</rules>"#;

        assert_eq!(
            structural_skeleton_hash(prompt_v1),
            structural_skeleton_hash(prompt_v2),
            "Same template with different config values should produce the same skeleton hash"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_differs_for_different_agents() {
        let browser_agent = r#"You are an AI agent designed to automate browser tasks.
<agent_configuration>Model: x</agent_configuration>
<rules>Click things</rules>"#;

        let code_agent = r#"You are Claude Code, an AI coding assistant.
<instructions>Write code</instructions>
<tools>bash, read, write</tools>"#;

        assert_ne!(
            structural_skeleton_hash(browser_agent),
            structural_skeleton_hash(code_agent),
            "Different agents should produce different skeleton hashes"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_no_tags() {
        let plain_v1 = "You are a helpful customer support agent. Answer questions politely. Use the knowledge base.";
        let plain_v2 = "You are a helpful customer support agent. Answer questions politely. Be concise.";

        assert_eq!(
            structural_skeleton_hash(plain_v1),
            structural_skeleton_hash(plain_v2),
            "Same first sentence with no tags should produce the same hash"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_case_insensitive() {
        let lower = "You are an AI assistant.\n<rules>be helpful</rules>";
        let upper = "YOU ARE AN AI ASSISTANT.\n<RULES>BE HELPFUL</RULES>";

        assert_eq!(
            structural_skeleton_hash(lower),
            structural_skeleton_hash(upper),
        );
    }

    #[test]
    fn test_structural_skeleton_hash_newline_boundary() {
        // First sentence should stop at \n, not include tag content
        let prompt_a = "You are a browser automation agent\n<config>Model: gpt-4</config>";
        let prompt_b = "You are a browser automation agent\n<config>Model: claude-3</config>";

        assert_eq!(
            structural_skeleton_hash(prompt_a),
            structural_skeleton_hash(prompt_b),
            "Newline should terminate first sentence before dynamic tag content"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_period_boundary() {
        // First sentence stops at period; content after differs
        let v1 = "You are a helpful coding assistant. Today is Monday. User: Alice.";
        let v2 = "You are a helpful coding assistant. Today is Friday. User: Bob.";

        assert_eq!(
            structural_skeleton_hash(v1),
            structural_skeleton_hash(v2),
            "Only first sentence (up to first period) should matter"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_whitespace_normalization() {
        let spaced = "You   are  an   AI   assistant.\n<rules>  help  </rules>";
        let compact = "You are an AI assistant.\n<rules>help</rules>";

        assert_eq!(
            structural_skeleton_hash(spaced),
            structural_skeleton_hash(compact),
            "Extra whitespace in first sentence should not affect hash"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_short_prompt_fallback() {
        // Less than 20 chars before any boundary -- uses 200-char fallback
        let short = "Be helpful.";
        let hash = structural_skeleton_hash(short);
        assert_eq!(hash.len(), 8, "Should still produce an 8-char hash");
    }

    #[test]
    fn test_structural_skeleton_hash_tag_order_irrelevant() {
        let order_a = "You are an AI agent for testing.\n<beta>x</beta>\n<alpha>y</alpha>";
        let order_b = "You are an AI agent for testing.\n<alpha>z</alpha>\n<beta>w</beta>";

        assert_eq!(
            structural_skeleton_hash(order_a),
            structural_skeleton_hash(order_b),
            "Tag order should not affect hash (tags are sorted)"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_duplicate_tags() {
        let single = "You are an AI agent for testing.\n<rules>rule 1</rules>";
        let duped = "You are an AI agent for testing.\n<rules>rule 1</rules>\n<rules>rule 2</rules>";

        assert_eq!(
            structural_skeleton_hash(single),
            structural_skeleton_hash(duped),
            "Duplicate tag names should be deduped"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_same_sentence_different_tags() {
        let with_rules = "You are an AI agent for testing.\n<rules>be safe</rules>";
        let with_tools = "You are an AI agent for testing.\n<tools>search, read</tools>";

        assert_ne!(
            structural_skeleton_hash(with_rules),
            structural_skeleton_hash(with_tools),
            "Same sentence but different tag names should produce different hashes"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_self_closing_tags() {
        let normal = "You are an AI agent for testing.\n<config>stuff</config>";
        let self_closing = "You are an AI agent for testing.\n<config />";

        assert_eq!(
            structural_skeleton_hash(normal),
            structural_skeleton_hash(self_closing),
            "Self-closing tags should extract the same tag name"
        );
    }
}
