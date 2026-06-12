use std::sync::Arc;

use actix_web::{HttpResponse, patch, web};
use uuid::Uuid;

use crate::{
    db::{DB, debugger_sessions::update_debugger_session_name},
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNameRequest {
    pub name: String,
}

/// `PATCH /api/v1/projects/{project_id}/rollouts/{session_id}/name` — rename a
/// debug session from the frontend (auth handled by the Next.js middleware on
/// the projects path). Update-only: unknown session id → 404.
///
/// Writes the name AND publishes `session_update`, mirroring the CLI rename
/// (`api::v1::cli::rollouts::update_name`) so both rename paths broadcast the
/// same event — every open debugger-session view (this tab and others) updates
/// its title live instead of going stale until reload.
#[patch("rollouts/{session_id}/name")]
pub async fn update_session_name(
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<UpdateNameRequest>,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let db = db.into_inner();
    let (project_id, session_id) = path.into_inner();
    let name = body.into_inner().name;

    let updated = update_debugger_session_name(&db.pool, &session_id, &project_id, &name).await?;
    if !updated {
        return Ok(HttpResponse::NotFound().json("Session not found"));
    }

    // Fire-and-forget broadcast (`send_to_key` swallows errors) so a pubsub
    // failure never fails the rename itself.
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
