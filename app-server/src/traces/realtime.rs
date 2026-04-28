//! Realtime updates for traces and spans via SSE

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::TRACE_EVALUATION_ID_CACHE_KEY},
    ch::evaluation_datapoints::get_evaluation_id_by_trace_id,
    db::{spans::Span, spans::SpanType, trace::Trace},
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    traces::span_attributes::ASSOCIATION_PROPERTIES_PREFIX,
};

const TRACE_EVALUATION_ID_TTL_SECONDS: u64 = 86_400;
const EVALUATION_TOP_SPAN_NAME: &str = "evaluation";
const EVALUATION_ID_ATTRIBUTE_SUFFIX: &str = "evaluation_id";

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
    tags: Vec<String>, // Span tags
    root_span_input: Option<String>,
    root_span_output: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RealtimeDebuggerTrace {
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

pub async fn send_trace_updates(
    traces: &[Trace],
    spans: &[Span],
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    pubsub: &PubSub,
) {
    if traces.is_empty() {
        return;
    }

    let trace_to_evaluation = resolve_trace_to_evaluation(traces, spans, cache, clickhouse).await;

    let mut traces_by_project: HashMap<Uuid, Vec<RealtimeTrace>> = HashMap::new();
    let mut traces_by_evaluation: HashMap<(Uuid, Uuid), Vec<RealtimeTrace>> = HashMap::new();
    let mut traces_by_rollout_session: HashMap<(Uuid, String), Vec<RealtimeDebuggerTrace>> =
        HashMap::new();

    for trace in traces {
        let realtime_trace = RealtimeTrace::from_trace(trace);

        if let Some(evaluation_id) = trace_to_evaluation.get(&trace.id()) {
            traces_by_evaluation
                .entry((trace.project_id(), *evaluation_id))
                .or_default()
                .push(realtime_trace);
        } else if trace
            .top_span_name()
            .as_deref()
            .is_some_and(|name| name == EVALUATION_TOP_SPAN_NAME)
        {
            // Unresolved evaluation trace — keep it out of the global feed.
            continue;
        } else {
            traces_by_project
                .entry(trace.project_id())
                .or_default()
                .push(realtime_trace);
        }

        if let Some(rollout_session_id) = trace
            .metadata()
            .and_then(|m| m.get("rollout.session_id"))
            .and_then(|v| v.as_str())
        {
            traces_by_rollout_session
                .entry((trace.project_id(), rollout_session_id.to_string()))
                .or_default()
                .push(RealtimeDebuggerTrace {
                    trace_id: trace.id(),
                    metadata: trace.metadata().cloned(),
                    has_browser_session: trace.has_browser_session(),
                });
        }
    }

    for (project_id, traces_data) in traces_by_project {
        let trace_message = SseMessage {
            event_type: "trace_update".to_string(),
            data: serde_json::json!({
                "traces": traces_data
            }),
        };

        send_to_key(pubsub, &project_id, "traces", trace_message).await;
    }

    for ((project_id, evaluation_id), traces_data) in traces_by_evaluation {
        let trace_message = SseMessage {
            event_type: "trace_update".to_string(),
            data: serde_json::json!({
                "traces": traces_data
            }),
        };

        let evaluation_key = format!("evaluation_{}", evaluation_id);
        send_to_key(pubsub, &project_id, &evaluation_key, trace_message).await;
    }

    for ((project_id, rollout_session_id), traces_data) in traces_by_rollout_session {
        let trace_message = SseMessage {
            event_type: "trace_update".to_string(),
            data: serde_json::json!({
                "traces": traces_data
            }),
        };

        let rollout_session_key = format!("rollout_session_{}", rollout_session_id);
        send_to_key(pubsub, &project_id, &rollout_session_key, trace_message).await;
    }
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
            root_span_input: trace.root_span_input(),
            root_span_output: trace.root_span_output(),
        }
    }
}

/// Build a `trace_id -> evaluation_id` map for evaluation traces in this batch.
async fn resolve_trace_to_evaluation(
    traces: &[Trace],
    spans: &[Span],
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
) -> HashMap<Uuid, Uuid> {
    let evaluation_traces: Vec<(Uuid, Uuid)> = traces
        .iter()
        .filter(|t| {
            t.top_span_name()
                .as_deref()
                .is_some_and(|name| name == EVALUATION_TOP_SPAN_NAME)
        })
        .map(|t| (t.id(), t.project_id()))
        .collect();

    if evaluation_traces.is_empty() {
        return HashMap::new();
    }

    let from_spans = evaluation_ids_from_spans(spans);

    let mut resolved: HashMap<Uuid, Uuid> = HashMap::new();
    let mut needs_lookup: Vec<(Uuid, Uuid)> = Vec::new();

    for (trace_id, project_id) in evaluation_traces {
        if let Some(eval_id) = from_spans.get(&trace_id).copied() {
            resolved.insert(trace_id, eval_id);
        } else {
            needs_lookup.push((trace_id, project_id));
        }
    }

    if needs_lookup.is_empty() {
        return resolved;
    }

    let lookups = needs_lookup.into_iter().map(|(trace_id, project_id)| {
        let cache = cache.clone();
        let clickhouse = clickhouse.clone();
        async move {
            let eval_id = resolve_one(trace_id, project_id, cache, clickhouse).await?;
            Some((trace_id, eval_id))
        }
    });

    for (trace_id, eval_id) in futures_util::future::join_all(lookups)
        .await
        .into_iter()
        .flatten()
    {
        resolved.insert(trace_id, eval_id);
    }

    resolved
}

fn evaluation_ids_from_spans(spans: &[Span]) -> HashMap<Uuid, Uuid> {
    let key = format!("{ASSOCIATION_PROPERTIES_PREFIX}.{EVALUATION_ID_ATTRIBUTE_SUFFIX}");
    let mut out: HashMap<Uuid, Uuid> = HashMap::new();
    for span in spans {
        if out.contains_key(&span.trace_id) {
            continue;
        }
        if let Some(eval_id) = span
            .attributes
            .raw_attributes
            .get(&key)
            .and_then(|v| v.as_str())
            .and_then(|s| Uuid::parse_str(s).ok())
        {
            out.insert(span.trace_id, eval_id);
        }
    }
    out
}

async fn resolve_one(
    trace_id: Uuid,
    project_id: Uuid,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
) -> Option<Uuid> {
    let key = format!(
        "{}:{}:{}",
        TRACE_EVALUATION_ID_CACHE_KEY, project_id, trace_id
    );

    match cache.get::<Uuid>(&key).await {
        Ok(Some(eval_id)) => return Some(eval_id),
        Ok(None) => {}
        Err(e) => log::warn!("Failed to read evaluation_id cache for {}: {:?}", key, e),
    }

    match get_evaluation_id_by_trace_id(clickhouse, project_id, trace_id).await {
        Ok(Some(eval_id)) => {
            if let Err(e) = cache
                .insert_with_ttl(&key, eval_id, TRACE_EVALUATION_ID_TTL_SECONDS)
                .await
            {
                log::warn!("Failed to cache evaluation_id for {}: {:?}", key, e);
            }
            Some(eval_id)
        }
        Ok(None) => None,
        Err(e) => {
            log::warn!("Failed to look up evaluation_id for {}: {:?}", trace_id, e);
            None
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
