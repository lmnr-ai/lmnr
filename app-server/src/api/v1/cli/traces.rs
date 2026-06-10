use std::sync::Arc;

use actix_web::{HttpResponse, post, web};

use crate::{
    api::v1::traces_metadata::UpdateTraceMetadataRequest,
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    db::{DB, trace::trace_exists},
    mq::MessageQueue,
    routes::types::ResponseResult,
    traces::metadata::publish_trace_metadata_patch,
};

/// `POST /v1/cli/traces/metadata` — CLI twin of `/v1/traces/metadata` (which
/// stays project-API-key for SDKs/customers). Same `trace_exists` +
/// `publish_trace_metadata_patch` helpers; differs only in auth
/// (`CliProjectAuth` user token, full member — not an ingest-only key).
#[post("metadata")]
pub async fn update_trace_metadata(
    auth: CliProjectAuth,
    req: web::Json<UpdateTraceMetadataRequest>,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let project_id = auth.project_id;
    let req = req.into_inner();

    if req.metadata.is_empty() {
        return Ok(HttpResponse::BadRequest().json("metadata cannot be empty"));
    }

    let db = db.into_inner();
    let cache = cache.into_inner();

    if !trace_exists(&db.pool, project_id, req.trace_id).await? {
        return Ok(HttpResponse::NotFound().json("Trace not found"));
    }

    publish_trace_metadata_patch(
        req.trace_id,
        project_id,
        req.metadata,
        spans_message_queue.as_ref().clone(),
        db,
        cache,
    )
    .await
    .map_err(|e| {
        log::error!("Failed to publish trace metadata patch: {:?}", e);
        anyhow::anyhow!("Failed to publish trace metadata patch")
    })?;

    Ok(HttpResponse::Ok().finish())
}
