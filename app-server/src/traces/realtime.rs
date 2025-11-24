//! Realtime updates for traces and spans via SSE

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    db::{spans::Span, spans::SpanType, trace::Trace},
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
};

/// Realtime trace data for frontend consumption
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RealtimeTrace {
    id: Uuid,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    session_id: Option<String>,
    input_tokens: i64,
    output_tokens: i64,
    total_tokens: i64,
    input_cost: f64,
    output_cost: f64,
    total_cost: f64,
    metadata: Option<Value>,
    top_span_id: Option<Uuid>,
    trace_type: String,
    top_span_name: Option<String>,
    top_span_type: Option<String>,
    status: Option<String>,
    user_id: Option<String>,
    tags: Vec<String>,
}

/// Realtime span data for frontend consumption (lightweight, no input/output)
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RealtimeSpan {
    span_id: Uuid,
    parent_span_id: Option<Uuid>,
    trace_id: Uuid,
    span_type: SpanType,
    name: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    attributes: Value,
    status: Option<String>,
    project_id: Uuid,
    created_at: DateTime<Utc>,
}

/// Send realtime span update events to SSE connections for specific traces
pub async fn send_span_updates(spans: &[Span], pubsub: &PubSub) {
    // All spans in a batch have the same project_id
    let project_id = spans.first().map(|s| s.project_id).unwrap_or_default();

    // Group spans by trace_id
    let mut spans_by_trace: std::collections::HashMap<Uuid, Vec<RealtimeSpan>> =
        std::collections::HashMap::new();

    for span in spans {
        let span_data = RealtimeSpan::from_span(span);
        spans_by_trace
            .entry(span.trace_id)
            .or_insert_with(Vec::new)
            .push(span_data);
    }

    // Send batched span updates for each trace
    for (trace_id, spans_data) in spans_by_trace {
        let span_message = SseMessage {
            event_type: "span_update".to_string(),
            data: serde_json::json!({
                "spans": spans_data
            }),
        };

        // Send to specific trace subscription key
        let trace_key = format!("trace_{}", trace_id);
        send_to_key(pubsub, &project_id, &trace_key, span_message).await;
    }
}

/// Send trace update events to SSE connections for the traces table
pub async fn send_trace_updates(traces: &[Trace], pubsub: &PubSub) {
    if traces.is_empty() {
        return;
    }

    // All traces in a batch have the same project_id
    let project_id = traces.first().map(|t| t.project_id()).unwrap_or_default();

    // Convert all traces to realtime format
    let traces_data: Vec<RealtimeTrace> = traces
        .iter()
        .filter(|trace| {
            // Very rudimentary filter to exclude evaluation traces
            if let Some(top_span_name) = trace.top_span_name() {
                if top_span_name == "evaluation" {
                    return false;
                }
            }
            true
        })
        .map(RealtimeTrace::from_trace)
        .collect();

    let trace_message = SseMessage {
        event_type: "trace_update".to_string(),
        data: serde_json::json!({
            "traces": traces_data
        }),
    };

    // Send batched traces to "traces" subscription key for traces table
    send_to_key(pubsub, &project_id, "traces", trace_message).await;
}

impl RealtimeTrace {
    /// Convert database trace to realtime format
    fn from_trace(trace: &Trace) -> Self {
        Self {
            id: trace.id(),
            start_time: trace.start_time(),
            end_time: trace.end_time(),
            session_id: trace.session_id(),
            input_tokens: trace.input_token_count(),
            output_tokens: trace.output_token_count(),
            total_tokens: trace.total_token_count(),
            input_cost: trace.input_cost(),
            output_cost: trace.output_cost(),
            total_cost: trace.cost(),
            metadata: trace.metadata().cloned(),
            top_span_id: trace.top_span_id(),
            trace_type: trace.trace_type().to_string(),
            top_span_name: trace.top_span_name(),
            top_span_type: trace
                .top_span_type()
                .map(|t| SpanType::from(t as u8).to_string()),
            status: trace.status(),
            user_id: trace.user_id(),
            tags: trace.tags().clone(),
        }
    }
}

impl RealtimeSpan {
    /// Convert span to lightweight realtime format
    /// Excludes heavy input/output fields for performance
    fn from_span(span: &Span) -> Self {
        Self {
            span_id: span.span_id,
            parent_span_id: span.parent_span_id,
            trace_id: span.trace_id,
            span_type: span.span_type.clone(),
            name: span.name.clone(),
            start_time: span.start_time,
            end_time: span.end_time,
            attributes: span.attributes.to_value(),
            status: span.status.clone(),
            project_id: span.project_id,
            created_at: span.start_time, // Use start_time as created_at for compatibility
        }
    }
}
