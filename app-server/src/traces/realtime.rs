//! Realtime updates for traces and spans via SSE

use serde_json::Value;

use crate::{
    db::{spans::Span, trace::Trace},
    realtime::{SseConnectionMap, SseMessage, send_to_key},
};

/// Send realtime span update events to SSE connections for specific traces
pub async fn send_span_updates(spans: &[Span], sse_connections: &SseConnectionMap) {
    // All spans in a batch have the same project_id
    let project_id = spans.first().map(|s| s.project_id).unwrap_or_default();

    // Group spans by trace_id
    let mut spans_by_trace: std::collections::HashMap<uuid::Uuid, Vec<Value>> =
        std::collections::HashMap::new();

    for span in spans {
        let span_data = span_to_realtime_json(span);
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
        send_to_key(sse_connections, &project_id, &trace_key, span_message);
    }
}

/// Send trace update events to SSE connections for the traces table
pub async fn send_trace_updates(traces: &[Trace], sse_connections: &SseConnectionMap) {
    if traces.is_empty() {
        return;
    }

    // All traces in a batch have the same project_id
    let project_id = traces.first().map(|t| t.project_id()).unwrap_or_default();

    // Convert all traces to JSON
    let traces_data: Vec<Value> = traces
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
        .map(|trace| trace_to_realtime_json(trace))
        .collect();

    let trace_message = SseMessage {
        event_type: "trace_update".to_string(),
        data: serde_json::json!({
            "traces": traces_data
        }),
    };

    // Send batched traces to "traces" subscription key for traces table
    send_to_key(sse_connections, &project_id, "traces", trace_message);
}

/// Convert database trace to frontend trace row format for realtime updates
fn trace_to_realtime_json(trace: &Trace) -> Value {
    serde_json::json!({
        "id": trace.id(),
        "startTime": trace.start_time(),
        "endTime": trace.end_time(),
        "sessionId": trace.session_id(),
        "inputTokens": trace.input_token_count(),
        "outputTokens": trace.output_token_count(),
        "totalTokens": trace.total_token_count(),
        "inputCost": trace.input_cost(),
        "outputCost": trace.output_cost(),
        "totalCost": trace.cost(),
        "metadata": trace.metadata(),
        "topSpanId": trace.top_span_id(),
        "traceType": "DEFAULT", // Simplified for now
        "topSpanName": trace.top_span_name(),
        "topSpanType": trace.top_span_type(),
        "status": trace.status(),
        "userId": trace.user_id(),
        "tags": trace.tags(),
    })
}

/// Convert span to lightweight format for realtime updates
/// Excludes heavy input/output fields for performance
fn span_to_realtime_json(span: &Span) -> Value {
    serde_json::json!({
        "spanId": span.span_id,
        "parentSpanId": span.parent_span_id,
        "traceId": span.trace_id,
        "spanType": span.span_type,
        "name": span.name,
        "startTime": span.start_time,
        "endTime": span.end_time,
        "attributes": span.attributes.to_value(),
        "status": span.status,
        "projectId": span.project_id,
        "createdAt": span.start_time, // Use start_time as created_at for compatibility
        // Note: input and output fields are intentionally excluded for performance
    })
}
