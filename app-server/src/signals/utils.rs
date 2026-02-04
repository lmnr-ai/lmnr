use anyhow::Result;
use chrono::Utc;
use regex::Regex;
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::{
        events::{Event, EventSource},
        spans::{Span, SpanType},
    },
    mq::{MessageQueue, MessageQueueTrait},
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY, spans::SpanAttributes},
};

// internal span for observability
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
    pub output_tokens: Option<i32>,
    pub model: String,
    pub provider: String,
    pub internal_project_id: Option<Uuid>,
    /// Job IDs associated with this span (may be empty for triggered runs)
    pub job_id: Option<Uuid>,
    pub error: Option<String>,
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

/// Emits an internal tracing span for observability.
/// This is used for internal tracing of signal workers.
/// Returns Uuid::nil() if internal_project_id is None.
pub async fn emit_internal_span(queue: Arc<MessageQueue>, span: InternalSpan) -> Uuid {
    let project_id = match span.internal_project_id {
        Some(id) => id,
        None => return Uuid::nil(), // Internal tracing disabled
    };

    let span_id = Uuid::new_v4();

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
    if let Some(tokens) = span.output_tokens {
        attrs.insert(
            "gen_ai.usage.output_tokens".to_string(),
            Value::Number(tokens.into()),
        );
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
            serde_json::json!(["signal.run".to_string(), span.name.to_string()]),
            // TODO: Pass parent span name in the message
        );
    } else {
        attrs.insert(
            "lmnr.span.ids_path".to_string(),
            serde_json::json!([span_id.to_string()]),
        );
        attrs.insert(
            "lmnr.span.path".to_string(),
            serde_json::json!([span.name.to_string()]),
        );
    }

    let db_span: Span = Span {
        span_id,
        project_id,
        trace_id: span.trace_id,
        parent_span_id: span.parent_span_id,
        name: span.name.to_string(),
        attributes: SpanAttributes::new(attrs),
        input: span.input,
        output: span.output,
        span_type: span.span_type,
        start_time: span.start_time,
        end_time: Utc::now(),
        events: None,
        status: Some("OK".to_string()),
        tags: None,
        input_url: None,
        output_url: None,
    };

    let error_event = if let Some(error) = span.error {
        Some(Event {
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
        })
    } else {
        None
    };

    let message = RabbitMqSpanMessage {
        span: db_span,
        events: error_event.map(|event| vec![event]).unwrap_or_default(),
    };

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
