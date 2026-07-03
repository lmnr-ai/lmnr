use actix_web::{HttpResponse, delete, get, post, web};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::project_api_keys::ProjectApiKey,
    db::{
        DB, debugger_session_blocks,
        debugger_sessions::{
            create_or_update_debugger_session, debugger_session_exists, delete_debugger_session,
        },
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

/// `GET /v1/rollouts/{session_id}/blocks` — list a session's blocks, oldest
/// first. Unknown or cross-project session → 404; a registered session with no
/// blocks yet → 200 with an empty list.
#[get("rollouts/{session_id}/blocks")]
pub async fn list_blocks(
    path: web::Path<Uuid>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_list_blocks(project_api_key.project_id, path.into_inner(), &db).await
}

/// Handler body for the blocks list, shared with the CLI twin.
pub async fn handle_list_blocks(
    project_id: Uuid,
    session_id: Uuid,
    db: &web::Data<DB>,
) -> ResponseResult {
    if !debugger_session_exists(&db.pool, &session_id, &project_id).await? {
        return Ok(HttpResponse::NotFound().json("Session not found"));
    }

    let blocks =
        debugger_session_blocks::get_blocks_for_session(&db.pool, &project_id, &session_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "blocks": blocks })))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddBlockRequest {
    #[serde(rename = "type")]
    pub block_type: String,
    pub content: serde_json::Value,
}

/// `POST /v1/rollouts/{session_id}/blocks` — append a block to a session,
/// returning the new block id. Unknown or cross-project session → 404 (the
/// insert is gated on the session existing in the project). Used by the CLI
/// (`debug session add-note`) to attach standalone `text` notes.
#[post("rollouts/{session_id}/blocks")]
pub async fn add_block(
    path: web::Path<Uuid>,
    project_api_key: ProjectApiKey,
    body: web::Json<AddBlockRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_add_block(
        project_api_key.project_id,
        path.into_inner(),
        body.into_inner(),
        &db,
    )
    .await
}

/// Handler body for appending a block, shared with the CLI twin.
pub async fn handle_add_block(
    project_id: Uuid,
    session_id: Uuid,
    body: AddBlockRequest,
    db: &web::Data<DB>,
) -> ResponseResult {
    match debugger_session_blocks::insert_block(
        &db.pool,
        &project_id,
        &session_id,
        &body.block_type,
        &body.content,
    )
    .await?
    {
        Some(id) => Ok(HttpResponse::Ok().json(serde_json::json!({ "id": id }))),
        None => Ok(HttpResponse::NotFound().json("Session not found")),
    }
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
