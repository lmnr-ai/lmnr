use actix_web::{HttpResponse, delete, patch, post, web};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    db::{
        DB,
        project_api_keys::ProjectApiKey,
        rollout_sessions::{
            RolloutSessionStatus, create_or_update_rollout_session, delete_rollout_session,
            update_session_status,
        },
    },
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

#[derive(serde::Deserialize)]
struct UpdateStatusRequest {
    status: RolloutSessionStatus,
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
        create_or_update_rollout_session(&db.pool, &session_id, &project_id, name).await?;

    Ok(HttpResponse::Ok().json(session))
}

/// Persist a session status change and notify the live trace view so the human
/// sees status transitions.
async fn update_status_and_broadcast(
    db: &DB,
    pubsub: &PubSub,
    project_id: &Uuid,
    session_id: &Uuid,
    new_status: RolloutSessionStatus,
) -> anyhow::Result<()> {
    update_session_status(&db.pool, session_id, project_id, new_status).await?;

    let message = SseMessage {
        event_type: "status_update".to_string(),
        data: serde_json::json!({
            "session_id": session_id,
            "status": new_status,
        }),
    };
    let key = format!("rollout_session_{}", session_id);
    send_to_key(pubsub, project_id, &key, message).await;

    Ok(())
}

#[patch("rollouts/{session_id}/status")]
pub async fn update_status(
    path: web::Path<Uuid>,
    body: web::Json<UpdateStatusRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let session_id = path.into_inner();
    let project_id = project_api_key.project_id;
    let new_status = body.into_inner().status;

    update_status_and_broadcast(
        db.get_ref(),
        pubsub.get_ref().as_ref(),
        &project_id,
        &session_id,
        new_status,
    )
    .await?;

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

    delete_rollout_session(&db.pool, &session_id, &project_id).await?;

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
