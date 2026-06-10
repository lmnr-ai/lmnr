use std::sync::Arc;

use actix_web::{post, web};

use crate::{
    api::v1::traces_metadata::{UpdateTraceMetadataRequest, run_update_trace_metadata},
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    db::DB,
    mq::MessageQueue,
    routes::types::ResponseResult,
};

/// `POST /v1/cli/traces/metadata` — CLI twin of `/v1/traces/metadata` (which
/// stays project-API-key for SDKs/customers). User-token auth via
/// `CliProjectAuth` (full member, not an ingest-only key).
#[post("metadata")]
pub async fn update_trace_metadata(
    auth: CliProjectAuth,
    req: web::Json<UpdateTraceMetadataRequest>,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    run_update_trace_metadata(
        auth.project_id,
        req.into_inner(),
        spans_message_queue,
        db,
        cache,
    )
    .await
}
