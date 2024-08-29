use std::{collections::HashMap, sync::Arc};

use actix_web::{get, post, web, HttpResponse};
use serde::Deserialize;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

use crate::{
    db::{
        api_keys::ProjectApiKey,
        events::{self},
        trace::{SpanType, SpanWithChecksAndEvents, Trace, TraceAttributes},
        DB,
    },
    language_model::LanguageModelRunner,
    routes::types::ResponseResult,
    traces::{get_llm_usage_for_span, BatchObservations},
};

#[derive(Deserialize)]
#[serde(untagged)]
enum Observation {
    Trace(Trace),
    Span(SpanWithChecksAndEvents),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadTracesRequest {
    pub traces: Vec<Observation>,
}

#[post("traces")]
pub async fn upload_traces(
    request: web::Json<UploadTracesRequest>,
    project_api_key: ProjectApiKey,
    language_model_runner: web::Data<Arc<LanguageModelRunner>>,
    tx: web::Data<Sender<BatchObservations>>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let language_model_runner = language_model_runner.as_ref().clone();
    let request = request.into_inner();
    let req_traces = request.traces;

    let mut traces = vec![];
    let mut spans_with_checks = vec![];
    let mut event_payloads = vec![];
    let mut cumulative_trace_attributes = HashMap::<Uuid, TraceAttributes>::new();

    for observation in req_traces {
        match observation {
            Observation::Trace(trace) => traces.push(trace),
            Observation::Span(span_with_checks) => {
                let span = &span_with_checks.span;
                let mut trace_attributes = cumulative_trace_attributes
                    .get(&span.trace_id)
                    .cloned()
                    .unwrap_or(TraceAttributes::new(span.trace_id));
                trace_attributes.update_start_time(span.start_time);
                trace_attributes.update_end_time(span.end_time);
                if span.span_type == SpanType::LLM {
                    let usage = get_llm_usage_for_span(span, language_model_runner.clone()).ok();
                    if let Some(usage) = usage {
                        trace_attributes.add_tokens(usage.total_tokens.unwrap_or_default() as i64);
                        trace_attributes.add_cost(usage.approximate_cost.unwrap_or_default());
                    }
                }
                cumulative_trace_attributes.insert(span.trace_id, trace_attributes);
                span_with_checks
                    .events
                    .clone()
                    .iter_mut()
                    .for_each(|event| {
                        event.span_id = span.id;
                        event_payloads.push(event.clone());
                    });
                spans_with_checks.push(span_with_checks);
            }
        }
    }

    tx.send(BatchObservations {
        project_id,
        traces,
        spans_with_checks,
        event_payloads,
        cumulative_trace_attributes,
    })
    .await
    .map_err(|e| anyhow::anyhow!("Failed to record observations: {}", e))?;

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetEventsForSessionRequest {
    session_id: String,
}

#[get("session-events")]
pub async fn get_events_for_session(
    request: web::Query<GetEventsForSessionRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let session_id = request.session_id.clone();
    let events = events::get_events_for_session(&db.pool, &session_id, &project_id)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get events for session: {}", e))?;
    Ok(HttpResponse::Ok().json(events))
}
