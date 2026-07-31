//! Realtime updates for traces and spans via SSE

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::traces::TraceAggregation,
    db::{spans::Span, spans::SpanType, trace::TraceType},
    evaluations::realtime::lookup_trace_evaluation_id,
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
};

/// Standalone agent-input event — the stat delta can't carry it (extraction
/// is async).
const AGENT_INPUT_UPDATE_EVENT: &str = "trace_agent_input_update";

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
    cache_read_input_tokens: i64,
    cache_creation_input_tokens: i64,
    reasoning_tokens: i64,
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

/// Span attribute carrying the debug/rollout session id. The SDK stamps the
/// session id as trace metadata (`rollout.session_id`), which lands on every
/// span under this association-property key — NOT as a bare
/// `lmnr.rollout.session_id` attribute (see send_span_updates).
const ROLLOUT_SESSION_SPAN_ATTR: &str = "lmnr.association.properties.metadata.rollout.session_id";
const EVALUATION_SPAN_ATTR: &str = "lmnr.association.properties.metadata.evaluation_id";

/// Send realtime span update events to SSE connections for specific traces, and
/// to the owning debug session channel when the span carries the session id.
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

        // Eval spans carry the session id too, but stay off the debugger channel.
        let is_evaluation_span = span
            .attributes
            .raw_attributes
            .get(EVALUATION_SPAN_ATTR)
            .is_some();

        if !is_evaluation_span
            && let Some(rollout_session_id) = span
                .attributes
                .raw_attributes
                .get(ROLLOUT_SESSION_SPAN_ATTR)
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

/// Per-batch delta updates, accumulated by the frontend.
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

/// Push the extracted `agent_input` (raw stored value) once available, since
/// the stat delta can't carry it. Routes to every channel the trace belongs to
/// (project / evaluation / debugger). Shape matches `agent_input as agentInput`.
pub async fn send_agent_input_update(
    pubsub: &PubSub,
    cache: &Cache,
    project_id: &Uuid,
    trace_id: Uuid,
    agent_input: &Value,
    rollout_session_id: Option<&str>,
) {
    let build = || SseMessage {
        event_type: AGENT_INPUT_UPDATE_EVENT.to_string(),
        data: serde_json::json!({ "traceId": trace_id, "agentInput": agent_input }),
    };
    for channel in channels_for_trace_id(*project_id, trace_id, rollout_session_id, cache).await {
        let key = match channel {
            TraceChannel::Project => "traces".to_string(),
            TraceChannel::Evaluation(evaluation_id) => format!("evaluation_{evaluation_id}"),
            TraceChannel::RolloutDebugger(session_id) => format!("rollout_session_{session_id}"),
        };
        send_to_key(pubsub, project_id, &key, build()).await;
    }
}

/// Push a resolved note / eval block to a debugger session (traces have their
/// own path). `block` mirrors the frontend `SessionBlock` shape.
pub async fn send_block_update(pubsub: &PubSub, project_id: &Uuid, session_id: &Uuid, block: Value) {
    let message = SseMessage {
        event_type: "block_update".to_string(),
        data: serde_json::json!({ "sessionId": session_id, "block": block }),
    };
    let key = format!("rollout_session_{}", session_id);
    send_to_key(pubsub, project_id, &key, message).await;
}

#[derive(Debug, Clone)]
pub enum TraceChannel {
    Project,
    Evaluation(Uuid),
    RolloutDebugger(String),
}

/// SSE channel routing from borrowed fields.
async fn channels_for_trace_fields(
    project_id: Uuid,
    trace_id: Uuid,
    top_span_name: Option<&str>,
    metadata: Option<&Value>,
    cache: &Cache,
) -> Vec<TraceChannel> {
    let mut channels = Vec::with_capacity(2);

    let is_evaluation_trace = top_span_name.is_some_and(|name| name == EVALUATION_TOP_SPAN_NAME);

    if is_evaluation_trace {
        let eval_id = match evaluation_id_from_metadata(metadata) {
            Some(id) => Some(id),
            None => lookup_trace_evaluation_id(cache, &project_id, &trace_id).await,
        };

        if let Some(id) = eval_id {
            channels.push(TraceChannel::Evaluation(id));
        }
    } else {
        channels.push(TraceChannel::Project);
    }

    // Eval traces are surfaced as evaluation blocks, not runs — keep off the channel.
    if !is_evaluation_trace {
        if let Some(rollout_session_id) = rollout_session_id_from_metadata(metadata) {
            channels.push(TraceChannel::RolloutDebugger(rollout_session_id));
        }
    }

    channels
}

/// Channel routing for the async agent_input event. Eval id from the
/// eval-datapoint cache (not reliably on spans); rollout session id stamped on
/// the extraction span and passed in. Eval trace → eval channel only; else
/// project + debugger (when a session is known).
pub async fn channels_for_trace_id(
    project_id: Uuid,
    trace_id: Uuid,
    rollout_session_id: Option<&str>,
    cache: &Cache,
) -> Vec<TraceChannel> {
    let mut channels = Vec::with_capacity(2);

    match lookup_trace_evaluation_id(cache, &project_id, &trace_id).await {
        Some(eval_id) => channels.push(TraceChannel::Evaluation(eval_id)),
        None => {
            channels.push(TraceChannel::Project);
            if let Some(session_id) = rollout_session_id {
                channels.push(TraceChannel::RolloutDebugger(session_id.to_string()));
            }
        }
    }

    channels
}

/// Channel routing for a per-batch delta.
pub async fn channels_for_aggregation(agg: &TraceAggregation, cache: &Cache) -> Vec<TraceChannel> {
    channels_for_trace_fields(
        agg.project_id,
        agg.trace_id,
        agg.top_span_name.as_deref(),
        agg.metadata.as_ref(),
        cache,
    )
    .await
}

fn evaluation_id_from_metadata(metadata: Option<&Value>) -> Option<Uuid> {
    metadata
        .and_then(|m| m.get(EVALUATION_ID_METADATA_KEY))
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
}

fn rollout_session_id_from_metadata(metadata: Option<&Value>) -> Option<String> {
    metadata
        .and_then(|m| m.get(ROLLOUT_SESSION_METADATA_KEY))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

impl RealtimeTrace {
    /// Per-batch delta payload, accumulated by the frontend.
    pub fn from_aggregation(agg: &TraceAggregation) -> Self {
        Self {
            id: agg.trace_id,
            start_time: agg.start_time,
            end_time: agg.end_time,
            session_id: agg.session_id.clone(),
            input_tokens: agg.input_tokens,
            output_tokens: agg.output_tokens,
            total_tokens: agg.total_tokens,
            cache_read_input_tokens: agg.cache_read_input_tokens,
            cache_creation_input_tokens: agg.cache_creation_input_tokens,
            reasoning_tokens: agg.reasoning_tokens,
            input_cost: agg.input_cost,
            output_cost: agg.output_cost,
            total_cost: agg.total_cost,
            metadata: agg.metadata.clone(),
            top_span_id: agg.top_span_id,
            // `agg.trace_type` is the numeric CH encoding — map it back to the
            // variant name the frontend's `traceType` union expects.
            trace_type: TraceType::from(agg.trace_type).to_string(),
            top_span_name: agg.top_span_name.clone(),
            top_span_type: agg
                .top_span_id
                .is_some()
                .then(|| SpanType::from(agg.top_span_type).to_string()),
            status: agg.status.clone(),
            user_id: agg.user_id.clone(),
            tags: agg.tags.iter().cloned().collect(),
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
