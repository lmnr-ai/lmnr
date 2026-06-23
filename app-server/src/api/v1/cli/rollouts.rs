use std::sync::Arc;

use actix_web::{HttpResponse, patch, post, web};
use uuid::Uuid;

use crate::{
    api::v1::rollouts::RegisterSessionRequest,
    auth::cli_user::CliProjectAuth,
    db::{
        DB,
        debugger_sessions::{create_or_update_debugger_session, update_debugger_session_name},
    },
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

/// `POST /v1/cli/rollouts/{session_id}` — CLI twin of `/v1/rollouts/{session_id}`
/// (which stays project-API-key for SDKs/customers). Same idempotent upsert and
/// JSON response; differs only in auth (`CliProjectAuth` user token).
#[post("rollouts/{session_id}")]
pub async fn register_session(
    path: web::Path<Uuid>,
    body: web::Json<RegisterSessionRequest>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id = path.into_inner();
    let project_id = auth.project_id;
    let name = body.into_inner().name;

    let session =
        create_or_update_debugger_session(&db.pool, &session_id, &project_id, name).await?;

    Ok(HttpResponse::Ok().json(session))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNameRequest {
    name: String,
}

/// `PATCH /v1/cli/rollouts/{session_id}/name` — rename a debug session (CLI-only;
/// the SDK names at register time). Update-only: unknown session id → 404.
#[patch("rollouts/{session_id}/name")]
pub async fn update_name(
    path: web::Path<Uuid>,
    body: web::Json<UpdateNameRequest>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id = path.into_inner();
    let project_id = auth.project_id;
    let name = body.into_inner().name;

    let updated = update_debugger_session_name(&db.pool, &session_id, &project_id, &name).await?;
    if !updated {
        return Ok(HttpResponse::NotFound().json("Session not found"));
    }

    // Notify the frontend live so an open debugger session view updates its
    // title without a reload. Fire-and-forget (`send_to_key` swallows errors)
    // so a pubsub failure never fails the rename.
    let message = SseMessage {
        event_type: "session_update".to_string(),
        data: serde_json::json!({
            "sessionId": session_id,
            "name": name,
        }),
    };
    let key = format!("rollout_session_{}", session_id);
    send_to_key(pubsub.get_ref().as_ref(), &project_id, &key, message).await;

    Ok(HttpResponse::Ok().finish())
}
