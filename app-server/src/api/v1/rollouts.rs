use actix_web::{HttpResponse, delete, patch, post, web};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    db::{
        DB,
        debugger_sessions::{
            create_or_update_debugger_session, delete_debugger_session,
            update_debugger_session_name,
        },
        project_api_keys::ProjectApiKey,
    },
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNameRequest {
    name: String,
}

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

/// Rename an existing debug session. Update-only: 404 when the session id is
/// unknown for this project (so a mistyped id is an error, not a ghost create).
/// Registration/creation stays the SDK's job via `register_session`.
#[patch("rollouts/{session_id}/name")]
pub async fn update_name(
    path: web::Path<Uuid>,
    body: web::Json<UpdateNameRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id = path.into_inner();
    let project_id = project_api_key.project_id;
    let name = body.into_inner().name;

    let updated = update_debugger_session_name(&db.pool, &session_id, &project_id, &name).await?;
    if !updated {
        return Ok(HttpResponse::NotFound().json("Session not found"));
    }

    // Notify the frontend live so an open debugger session view updates its title
    // without a reload. Mirrors the `delete` handler's publish; fire-and-forget
    // (`send_to_key` swallows errors) so a pubsub failure never fails the rename.
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
