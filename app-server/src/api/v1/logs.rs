use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, post, web};
use bytes::Bytes;
use prost::Message;

use crate::{
    db::{DB, project_api_keys::ProjectApiKey},
    features::{Feature, is_feature_enabled},
    logs::producer::push_logs_to_queue,
    mq::MessageQueue,
    opentelemetry_proto::opentelemetry::proto::collector::logs::v1::ExportLogsServiceRequest,
    routes::types::ResponseResult,
    traces::limits::get_workspace_limit_exceeded_by_project_id,
};

// /v1/logs
#[post("")]
pub async fn process_logs(
    req: HttpRequest,
    body: Bytes,
    project_api_key: ProjectApiKey,
    logs_message_queue: web::Data<Arc<MessageQueue>>,
    cache: web::Data<crate::cache::Cache>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let db = db.into_inner();
    let cache = cache.into_inner();
    let request = ExportLogsServiceRequest::decode(body).map_err(|e| {
        anyhow::anyhow!("Failed to decode ExportLogsServiceRequest from bytes. {e}")
    })?;
    let logs_message_queue = logs_message_queue.as_ref().clone();

    if is_feature_enabled(Feature::UsageLimit) {
        let limits_exceeded = get_workspace_limit_exceeded_by_project_id(
            db,
            clickhouse.as_ref().clone(),
            cache,
            project_api_key.project_id,
        )
        .await
        .map_err(|e| {
            log::error!("Failed to get workspace limits: {:?}", e);
        });

        if limits_exceeded.is_ok_and(|limits_exceeded| limits_exceeded.bytes_ingested) {
            return Ok(HttpResponse::Forbidden().json("Workspace data limit exceeded"));
        }
    }

    let response =
        push_logs_to_queue(request, project_api_key.project_id, logs_message_queue).await?;
    if response.partial_success.is_some() {
        return Err(anyhow::anyhow!("There has been an error during logs processing.").into());
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
