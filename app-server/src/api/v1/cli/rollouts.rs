use std::sync::Arc;

use actix_web::{HttpResponse, patch, web};
use uuid::Uuid;

use crate::{
    auth::cli_user::CliProjectAuth,
    db::{DB, debugger_sessions::update_debugger_session_name},
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNameRequest {
    name: String,
}

/// `PATCH /v1/cli/rollouts/{session_id}/name` — rename a debug session.
/// CLI user-token ONLY: the SDK names sessions at register time, so there is no
/// project-API-key twin (verified — only the CLI calls this). Update-only: 404
/// when the session id is unknown for this project (a mistyped id is an error,
/// not a ghost create).
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
