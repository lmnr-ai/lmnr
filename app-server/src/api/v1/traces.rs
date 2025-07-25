use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, get, post, web};
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{
        DB,
        events::Event,
        project_api_keys::ProjectApiKey,
        spans::Span,
        trace,
        traces::{self, GetTracesParams},
    }, // Updated import
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    opentelemetry::opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest,
    routes::types::ResponseResult,
    traces::{limits::get_workspace_limit_exceeded_by_project_id, producer::push_spans_to_queue},
};
use prost::Message;

#[derive(Serialize, Deserialize, Clone)]
pub struct RabbitMqSpanMessage {
    pub span: Span,
    pub events: Vec<Event>,
}

#[post("traces")]
pub async fn process_traces(
    req: HttpRequest,
    body: Bytes,
    project_api_key: ProjectApiKey,
    cache: web::Data<crate::cache::Cache>,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
) -> ResponseResult {
    let db = db.into_inner();
    let cache = cache.into_inner();
    let request = ExportTraceServiceRequest::decode(body).map_err(|e| {
        anyhow::anyhow!("Failed to decode ExportTraceServiceRequest from bytes. {e}")
    })?;
    let spans_message_queue = spans_message_queue.as_ref().clone();

    if is_feature_enabled(Feature::UsageLimit) {
        let limits_exceeded = get_workspace_limit_exceeded_by_project_id(
            db.clone(),
            cache.clone(),
            project_api_key.project_id,
        )
        .await?;

        if limits_exceeded.bytes_ingested {
            return Ok(HttpResponse::Forbidden().json("Workspace data limit exceeded"));
        }
    }

    let response =
        push_spans_to_queue(request, project_api_key.project_id, spans_message_queue).await?;
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

#[derive(Serialize)]
struct GetTracesResponse {
    data: Vec<traces::TraceInfo>,
    count: i64,
}

#[post("/traces/query")]
pub async fn get_traces(
    body: web::Json<GetTracesParams>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner();
    let query = body.into_inner();

    let (data, count) = traces::get_traces(&db.pool, &clickhouse, project_id, query).await?;

    let response = GetTracesResponse { data, count };

    Ok(HttpResponse::Ok().json(response))
}

#[get("/traces/{trace_id}")]
pub async fn get_trace(
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let trace_id = path.into_inner();
    let project_id = project_api_key.project_id;
    let db = db.into_inner();

    let trace = trace::get_trace(&db.pool, &project_id, &trace_id).await?;
    match trace {
        Some(trace) => Ok(HttpResponse::Ok().json(trace)),
        None => Ok(HttpResponse::NotFound().json("Trace not found")),
    }
}
