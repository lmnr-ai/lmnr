use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey, trace::trace_exists},
    mq::MessageQueue,
    routes::types::ResponseResult,
    traces::metadata::publish_trace_metadata_patch,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTraceMetadataRequest {
    pub trace_id: Uuid,
    pub metadata: HashMap<String, Value>,
}

/// `POST /v1/traces/metadata` — merge a metadata patch onto an existing trace.
///
/// The patch is delivered as a virtual span carrying
/// `lmnr.association.properties.metadata.<key>` attributes plus the
/// `lmnr.internal.metadata_only` marker. The consumer (`process_span_messages`)
/// splits these spans out before the regular pipeline and applies them to
/// `traces.metadata` via a UPDATE that takes the same row lock as the regular
/// `upsert_trace_statistics_batch`. The virtual span is never recorded to the
/// `spans` table and contributes nothing to trace stats (start/end/tokens/
/// num_spans/top_span/etc.).
#[post("metadata")]
pub async fn update_trace_metadata(
    req: web::Json<UpdateTraceMetadataRequest>,
    project_api_key: ProjectApiKey,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = req.into_inner();
    let project_id = project_api_key.project_id;

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
