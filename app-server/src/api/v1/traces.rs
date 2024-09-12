use std::sync::Arc;

use actix_web::{get, post, web, HttpRequest, HttpResponse};
use bytes::Bytes;
use lapin::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{
        api_keys::ProjectApiKey,
        events::{self, EvaluateEventRequest, EventObservation},
        trace::Span,
        DB,
    },
    opentelemetry::opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest,
    routes::types::ResponseResult,
    traces::process::process_trace_export,
};
use prost::Message;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RabbitMqSpanMessage {
    pub project_id: Uuid,
    pub span: Span,
    pub events: Vec<EventObservation>,
    pub evaluate_events: Vec<EvaluateEventRequest>,
}

#[post("traces")]
pub async fn process_traces(
    req: HttpRequest,
    body: Bytes,
    project_api_key: ProjectApiKey,
    rabbitmq_connection: web::Data<Arc<Connection>>,
) -> ResponseResult {
    let request = ExportTraceServiceRequest::decode(body).map_err(|e| {
        anyhow::anyhow!("Failed to decode ExportTraceServiceRequest from bytes. {e}")
    })?;
    let rabbitmq_connection = rabbitmq_connection.as_ref().clone();

    let response =
        process_trace_export(request, project_api_key.project_id, rabbitmq_connection).await?;
    if response.partial_success.is_some() {
        return Err(anyhow::anyhow!("There has been an error during trace processing.").into());
    }

    let keep_alive = req.headers().get("connection").map_or(false, |v| {
        v.to_str().unwrap_or_default().trim().to_lowercase() == "keep-alive"
    });
    if keep_alive {
        Ok(HttpResponse::Ok().keep_alive().finish())
    } else {
        Ok(HttpResponse::Ok().finish())
    }
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
