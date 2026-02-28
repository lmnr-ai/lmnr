use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey, spans::{Span, SpanType}},
    mq::MessageQueue,
    routes::types::ResponseResult,
    traces::{producer::publish_span_messages, spans::SpanAttributes},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpanRequest {
    pub name: String,
    pub span_type: Option<SpanType>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub input: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    pub attributes: Option<HashMap<String, serde_json::Value>>,
    pub trace_id: Option<Uuid>,
    pub span_id: Option<Uuid>,
    pub parent_span_id: Option<Uuid>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpanResponse {
    pub span_id: Uuid,
    pub trace_id: Uuid,
}

// /v1/spans
#[post("")]
pub async fn create_spans(
    request: web::Json<Vec<CreateSpanRequest>>,
    project_api_key: ProjectApiKey,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let requests = request.into_inner();

    let mut responses = Vec::with_capacity(requests.len());
    let mut messages = Vec::with_capacity(requests.len());

    for req in requests {
        let span_id = req.span_id.unwrap_or_else(Uuid::new_v4);
        let trace_id = req.trace_id.unwrap_or_else(Uuid::new_v4);

        let span = Span {
            span_id,
            trace_id,
            project_id,
            parent_span_id: req.parent_span_id,
            name: req.name,
            attributes: SpanAttributes::new(req.attributes.unwrap_or_default()),
            input: req.input,
            output: req.output,
            span_type: req.span_type.unwrap_or(SpanType::Default),
            start_time: req.start_time,
            end_time: req.end_time,
            status: None,
            events: vec![],
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        responses.push(CreateSpanResponse { span_id, trace_id });
        messages.push(RabbitMqSpanMessage { span });
    }

    publish_span_messages(
        messages,
        project_id,
        spans_message_queue.as_ref().clone(),
        db.into_inner(),
        cache.into_inner(),
    )
    .await
    .map_err(|e| {
        log::error!("Failed to publish spans to queue: {:?}", e);
        anyhow::anyhow!("Failed to publish spans")
    })?;

    Ok(HttpResponse::Ok().json(responses))
}
