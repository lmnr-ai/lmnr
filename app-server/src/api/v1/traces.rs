use std::sync::Arc;

use actix_web::{post, web, HttpRequest, HttpResponse};
use bytes::Bytes;
use lapin::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{events::EventObservation, project_api_keys::ProjectApiKey, spans::Span, DB},
    features::{is_feature_enabled, Feature},
    opentelemetry::opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest,
    routes::types::ResponseResult,
    traces::{limits::get_workspace_limit_exceeded_by_project_id, producer::push_spans_to_queue},
};
use prost::Message;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RabbitMqSpanMessage {
    pub project_id: Uuid,
    pub span: Span,
    pub events: Vec<EventObservation>,
}

#[post("traces")]
pub async fn process_traces(
    req: HttpRequest,
    body: Bytes,
    project_api_key: ProjectApiKey,
    rabbitmq_connection: web::Data<Option<Arc<Connection>>>,
    db: web::Data<DB>,
    cache: web::Data<crate::cache::Cache>,
) -> ResponseResult {
    let db = db.into_inner();
    let cache = cache.into_inner();
    let request = ExportTraceServiceRequest::decode(body).map_err(|e| {
        anyhow::anyhow!("Failed to decode ExportTraceServiceRequest from bytes. {e}")
    })?;
    let rabbitmq_connection = rabbitmq_connection.as_ref().clone();

    if is_feature_enabled(Feature::UsageLimit) {
        let limits_exceeded = get_workspace_limit_exceeded_by_project_id(
            db.clone(),
            cache.clone(),
            project_api_key.project_id,
        )
        .await?;

        // TODO: do the same for events
        if limits_exceeded.spans {
            return Ok(HttpResponse::Forbidden().json("Workspace span limit exceeded"));
        }
    }

    let response = push_spans_to_queue(
        request,
        project_api_key.project_id,
        rabbitmq_connection,
        db,
        cache,
    )
    .await?;
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
