use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::traces_agg,
    db::{DB, project_api_keys::ProjectApiKey, trace},
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
/// `traces.metadata` via an upsert that takes the same row lock as the regular
/// `upsert_trace_statistics_batch` (and creates a virtual trace row when the
/// trace's span batch hasn't been flushed yet — the handler's existence check
/// (`traces_agg` OR the Postgres `traces` row, since either store may be the
/// only one holding the trace during the LAM-2020 migration) keeps the public
/// endpoint 404ing on unknown traces, but a trace whose spans haven't landed
/// yet, or one deleted between request and consumption, leaves a metadata-only
/// stub row; accepted, see `merge_trace_metadata_batch`). The virtual span is never recorded to
/// the `spans` table and contributes nothing to trace stats (start/end/tokens/
/// top_span/etc.).
#[post("metadata")]
pub async fn update_trace_metadata(
    req: web::Json<UpdateTraceMetadataRequest>,
    project_api_key: ProjectApiKey,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    handle_trace_metadata(
        project_api_key.project_id,
        req,
        spans_message_queue,
        db,
        cache,
        clickhouse,
    )
    .await
}

/// Handler body for `/v1/traces/metadata`: empty-check, existence check, and
/// patch publish.
pub async fn handle_trace_metadata(
    project_id: Uuid,
    req: web::Json<UpdateTraceMetadataRequest>,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let req = req.into_inner();

    if req.metadata.is_empty() {
        return Ok(HttpResponse::BadRequest().json("metadata cannot be empty"));
    }

    let db = db.into_inner();
    let cache = cache.into_inner();

    // Check BOTH stores while the migration bridge is up. `traces_agg` only has
    // rows for traces ingested with `WRITE_TRACES_AGG` on (default off), so an
    // agg-only check would 404 every patch on a flag-off deployment and every
    // pre-flag historical trace. Postgres stops being authoritative once its
    // write is dropped, hence the union rather than a swap. `traces_agg` is
    // queried first so that on cloud (flag on) the common case short-circuits
    // there and the PG arm is only paid for traces the new store doesn't have.
    // Drop the PG arm in phase 3 (LAM-2020).
    let exists = traces_agg::trace_exists(clickhouse.as_ref(), project_id, req.trace_id).await?
        || trace::trace_exists(&db.pool, project_id, req.trace_id).await?;
    if !exists {
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
