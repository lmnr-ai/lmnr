use actix_web::{HttpResponse, patch, web};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    api::v1::rollouts::UpdateStatusRequest,
    db::{DB, rollout_sessions::update_session_status},
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

/// Frontend-driven status update (e.g. a human marks a session STOPPED). With
/// no executor there is nothing server-side to kill — status is just a label.
#[patch("rollouts/{session_id}/status")]
pub async fn update_status(
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<UpdateStatusRequest>,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let db = db.into_inner();
    let (project_id, session_id) = path.into_inner();
    let new_status = body.into_inner().status;

    update_session_status(&db.pool, &session_id, &project_id, new_status).await?;

    let message = SseMessage {
        event_type: "status_update".to_string(),
        data: serde_json::json!({
            "session_id": session_id,
            "status": new_status,
        }),
    };
    let key = format!("rollout_session_{}", session_id);
    send_to_key(pubsub.get_ref().as_ref(), &project_id, &key, message).await;

    Ok(HttpResponse::Ok().finish())
}
