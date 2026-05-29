//! Realtime updates for traces and spans via SSE

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{spans::Span, spans::SpanType, trace::Trace},
    evaluations::realtime::lookup_trace_evaluation_id,
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
};

const EVALUATION_TOP_SPAN_NAME: &str = "evaluation";
const ROLLOUT_SESSION_METADATA_KEY: &str = "rollout.session_id";
const EVALUATION_ID_METADATA_KEY: &str = "evaluation_id";

/// Realtime trace data for frontend consumption
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeTrace {
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
    tags: Vec<String>, // Span tags
    root_span_input: Option<String>,
    root_span_output: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeDebuggerTrace {
    trace_id: Uuid,
    metadata: Option<Value>,
    has_browser_session: Option<bool>,
}

/// Realtime span data for frontend consumption (lightweight, no input/output)
#[derive(Debug, Clone, Serialize)]
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
/// lmnr.rollout.session_id
pub async fn send_span_updates(spans: &[Span], pubsub: &PubSub) {
    // Group spans by (project_id, trace_id)
    let mut spans_by_trace: HashMap<(Uuid, Uuid), Vec<RealtimeSpan>> = HashMap::new();

    let mut spans_by_rollout_session: HashMap<(Uuid, String), Vec<RealtimeSpan>> = HashMap::new();

    for span in spans {
        let span_data = RealtimeSpan::from_span(span);

        spans_by_trace
            .entry((span.project_id, span.trace_id))
            .or_default()
            .push(span_data.clone());

        if let Some(rollout_session_id) = span
            .attributes
            .raw_attributes
            .get("lmnr.rollout.session_id")
            .and_then(|v| v.as_str())
        {
            spans_by_rollout_session
                .entry((span.project_id, rollout_session_id.to_string()))
                .or_default()
                .push(span_data);
        }
    }

    // Send batched span updates for each trace
    for ((project_id, trace_id), spans_data) in spans_by_trace {
        let span_message = SseMessage {
            event_type: "span_update".to_string(),
            data: serde_json::json!({
                "spans": spans_data
            }),
        };

        let trace_key = format!("trace_{}", trace_id);
        send_to_key(pubsub, &project_id, &trace_key, span_message).await;
    }

    for ((project_id, rollout_session_id), spans_data) in spans_by_rollout_session {
        let span_message = SseMessage {
            event_type: "span_update".to_string(),
            data: serde_json::json!({
                "spans": spans_data
            }),
        };

        let rollout_session_key = format!("rollout_session_{}", rollout_session_id);
        send_to_key(pubsub, &project_id, &rollout_session_key, span_message).await;
    }
}

pub async fn send_trace_updates<T: Serialize>(
    project_id: &Uuid,
    channel_key: &str,
    traces: &[T],
    pubsub: &PubSub,
) {
    if traces.is_empty() {
        return;
    }
    let message = SseMessage {
        event_type: "trace_update".to_string(),
        data: serde_json::json!({ "traces": traces }),
    };
    send_to_key(pubsub, project_id, channel_key, message).await;
}

#[derive(Debug, Clone)]
pub enum TraceChannel {
    Project,
    Evaluation(Uuid),
    RolloutDebugger(String),
}

pub async fn channels_for_trace(trace: &Trace, cache: &Cache) -> Vec<TraceChannel> {
    let mut channels = Vec::with_capacity(2);

    let is_evaluation_trace = trace
        .top_span_name()
        .as_deref()
        .is_some_and(|name| name == EVALUATION_TOP_SPAN_NAME);

    if is_evaluation_trace {
        let eval_id = match evaluation_id_from_metadata(trace) {
            Some(id) => Some(id),
            None => lookup_trace_evaluation_id(cache, &trace.project_id(), &trace.id()).await,
        };

        if let Some(id) = eval_id {
            channels.push(TraceChannel::Evaluation(id));
        }
    } else {
        channels.push(TraceChannel::Project);
    }

    if let Some(rollout_session_id) = rollout_session_id_from_metadata(trace) {
        channels.push(TraceChannel::RolloutDebugger(rollout_session_id));
    }

    channels
}

fn evaluation_id_from_metadata(trace: &Trace) -> Option<Uuid> {
    trace
        .metadata()
        .and_then(|m| m.get(EVALUATION_ID_METADATA_KEY))
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
}

fn rollout_session_id_from_metadata(trace: &Trace) -> Option<String> {
    trace
        .metadata()
        .and_then(|m| m.get(ROLLOUT_SESSION_METADATA_KEY))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

impl RealtimeTrace {
    /// Convert database trace to realtime format
    pub fn from_trace(trace: &Trace) -> Self {
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
            root_span_input: trace.root_span_input(),
            root_span_output: trace.root_span_output(),
        }
    }
}

impl RealtimeDebuggerTrace {
    pub fn from_trace(trace: &Trace) -> Self {
        Self {
            trace_id: trace.id(),
            metadata: trace.metadata().cloned(),
            has_browser_session: trace.has_browser_session(),
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
