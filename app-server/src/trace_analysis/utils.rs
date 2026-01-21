use anyhow::Result;
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

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

/// Replaces `<span>` XML tags with markdown URLs in a JSON value.
/// Converts sequential span IDs to real UUIDs using span_ids_map.
///
/// Format: `<span id='1' name='openai.chat' reference_text='...' />`
/// Becomes: `[openai.chat](https://www.lmnr.ai/project/{project_id}/traces/{trace_id}?spanId={uuid})`
///
/// # Arguments
/// * `attributes` - JSON value that may contain span tags in its string values
/// * `span_ids_map` - Maps sequential IDs (1, 2, 3...) to real span UUIDs
/// * `project_id` - Project UUID
/// * `trace_id` - Trace UUID
///
/// # Returns
/// JSON value with span tags replaced by markdown links
pub fn replace_span_tags_with_links(
    attributes: Value,
    span_ids_map: &HashMap<usize, Uuid>,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<Value> {
    // Convert to JSON string
    let json_str = serde_json::to_string(&attributes)?;

    // Pattern to match <span id='...' name='...' ... />
    let pattern = Regex::new(r#"<span\s+id=['"]([\d]+)['"]\s+name=['"]([^'"]+)['"][^>]*/?\s*>"#)?;

    // Replace all span tags
    let replaced_str = pattern.replace_all(&json_str, |caps: &regex::Captures| {
        let seq_id_str = &caps[1];
        let span_name = &caps[2];

        // Parse sequential ID and look up real UUID
        let seq_id: usize = seq_id_str.parse().unwrap_or(0);
        let real_span_id = span_ids_map
            .get(&seq_id)
            .map(|uuid| uuid.to_string())
            .unwrap_or_else(|| seq_id_str.to_string());

        format!(
            "[{}](https://www.lmnr.ai/project/{}/traces/{}?spanId={})",
            span_name, project_id, trace_id, real_span_id
        )
    });

    // Parse back to Value
    let result: Value = serde_json::from_str(&replaced_str)?;
    Ok(result)
}
