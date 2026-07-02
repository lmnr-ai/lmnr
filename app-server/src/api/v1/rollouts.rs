use actix_web::{HttpResponse, delete, post, web};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{
        DB, debugger_session_blocks,
        debugger_sessions::{create_or_update_debugger_session, delete_debugger_session},
        project_api_keys::ProjectApiKey,
    },
    debugger,
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RegisterSessionRequest {
    #[serde(default)]
    pub name: Option<String>,
}

/// Register (idempotent upsert) a debug session. The SDK calls this on the
/// first debug run with the session id it owns; the frontend may also call it
/// to create/rename a session. Incoming traces do NOT implicitly create
/// sessions — registration is explicit.
#[post("rollouts/{session_id}")]
pub async fn register_session(
    path: web::Path<Uuid>,
    project_api_key: ProjectApiKey,
    body: web::Json<RegisterSessionRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id = path.into_inner();
    let project_id = project_api_key.project_id;
    let name = body.into_inner().name;

    let session =
        create_or_update_debugger_session(&db.pool, &session_id, &project_id, name).await?;

    Ok(HttpResponse::Ok().json(session))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertBlockRequest {
    /// Explicit block id. When omitted, the id is derived deterministically
    /// from the referenced entity (`content.traceId` / `content.evaluationId`)
    /// so client retries collapse into one row; text blocks without an id get
    /// a random one.
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(rename = "type")]
    pub block_type: String,
    #[serde(default)]
    pub content: Option<Value>,
}

fn entity_id_from_content(content: &Value) -> Option<Uuid> {
    ["traceId", "evaluationId"]
        .iter()
        .find_map(|key| content.get(key))
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
}

pub async fn handle_upsert_block(
    db: &DB,
    project_id: Uuid,
    session_id: Uuid,
    req: UpsertBlockRequest,
) -> ResponseResult {
    if !debugger_session_blocks::ALLOWED_BLOCK_TYPES.contains(&req.block_type.as_str()) {
        return Ok(HttpResponse::BadRequest().json(format!(
            "Invalid block type. Allowed types: {}",
            debugger_session_blocks::ALLOWED_BLOCK_TYPES.join(", ")
        )));
    }

    let content = req.content.unwrap_or(Value::Object(Default::default()));
    let block_id = req
        .id
        .or(entity_id_from_content(&content).map(|entity_id| {
            debugger_session_blocks::deterministic_block_id(
                &session_id,
                &req.block_type,
                &entity_id,
            )
        }))
        .unwrap_or(Uuid::new_v4());

    let upserted = debugger_session_blocks::upsert_block(
        &db.pool,
        &project_id,
        &session_id,
        &block_id,
        &req.block_type,
        &content,
    )
    .await?;

    if !upserted {
        return Ok(HttpResponse::NotFound().json("Session not found"));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "id": block_id })))
}

/// Upsert a block (cell) into a debugger session. Blocks are written
/// explicitly by the SDK/CLI — never implicitly at trace ingest. The session
/// must be registered first (`POST rollouts/{session_id}`); an unknown session
/// id is a 404.
#[post("rollouts/{session_id}/blocks")]
pub async fn upsert_block(
    path: web::Path<Uuid>,
    project_api_key: ProjectApiKey,
    body: web::Json<UpsertBlockRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_upsert_block(
        &db,
        project_api_key.project_id,
        path.into_inner(),
        body.into_inner(),
    )
    .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheLookupRequest {
    pub replay_trace_id: Uuid,
    /// Span-id needle (hyphen-stripped suffix match); inclusive boundary.
    pub cache_until: String,
    /// Hex blake3 of the canonicalized non-system input array, computed by the SDK.
    pub input_hash: String,
}

/// Look up a recorded LLM response for a debug replay, warming the server-side
/// cache on the first cold call. The cache identity is
/// `(project_id, replay_trace_id)`; `session_id` stays in the path for routing
/// consistency with the sibling rollout routes but is not part of the cache key.
///
/// Returns one of three outcomes (HTTP 200, discriminated by `outcome`):
/// `hit` (replay this response), `miss` (run live forever), `live` (warmup still
/// running — run live this call, retry next).
#[post("rollouts/{session_id}/cache")]
pub async fn lookup_cache(
    _path: web::Path<Uuid>,
    project_api_key: ProjectApiKey,
    body: web::Json<CacheLookupRequest>,
    cache: web::Data<Cache>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let body = body.into_inner();

    let outcome = debugger::lookup(
        project_id,
        body.replay_trace_id,
        body.cache_until,
        body.input_hash,
        cache.into_inner(),
        clickhouse.as_ref().clone(),
    )
    .await;

    Ok(HttpResponse::Ok().json(outcome))
}

#[delete("rollouts/{session_id}")]
pub async fn delete(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id =
        Uuid::parse_str(&path.into_inner()).map_err(|_| anyhow::anyhow!("Invalid session ID"))?;
    let project_id = project_api_key.project_id;

    delete_debugger_session(&db.pool, &session_id, &project_id).await?;

    // Send deletion event to frontend via SSE
    let message = SseMessage {
        event_type: "session_deleted".to_string(),
        data: serde_json::json!({
            "session_id": session_id,
        }),
    };
    let key = format!("rollout_session_{}", session_id);
    send_to_key(pubsub.get_ref().as_ref(), &project_id, &key, message).await;

    Ok(HttpResponse::Ok().finish())
}
