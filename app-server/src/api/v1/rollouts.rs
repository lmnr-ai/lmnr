use actix_web::{HttpResponse, delete, patch, post, web};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    db::{
        DB,
        project_api_keys::ProjectApiKey,
        rollout_sessions::{
            RolloutSessionStatus, create_rollout_session, delete_rollout_session,
            get_rollout_session, update_session_status,
        },
        spans::SpanType,
    },
    pubsub::PubSub,
    realtime::{SseConnectionMap, SseMessage, create_sse_response, send_to_key},
    routes::types::ResponseResult,
};

#[derive(serde::Deserialize, serde::Serialize)]
pub struct InputParam {
    pub name: String,
}

#[derive(serde::Deserialize)]
pub struct UpdateStatusRequest {
    pub status: RolloutSessionStatus,
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct StreamRequest {
    pub params: Vec<InputParam>,
}

#[post("rollouts/{session_id}")]
pub async fn stream(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    body: web::Json<StreamRequest>,
    db: web::Data<DB>,
    connections: web::Data<SseConnectionMap>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id =
        Uuid::parse_str(&path.into_inner()).map_err(|_| anyhow::anyhow!("Invalid session ID"))?;
    let project_id = project_api_key.project_id;

    // Create rollout session if not exists
    if get_rollout_session(&db.pool, &session_id, &project_id)
        .await?
        .is_none()
    {
        let params = serde_json::to_value(body.into_inner().params)?;
        create_rollout_session(&db.pool, &session_id, &project_id, params).await?;
    }

    // Prepare handshake message
    let handshake = SseMessage {
        event_type: "handshake".to_string(),
        data: serde_json::json!({
            "session_id": session_id,
            "project_id": project_id,
        }),
    };

    // Start stream with initial handshake
    let key = format!("rollout_sdk_{}", session_id);
    let sse_response = create_sse_response(
        project_id,
        key.clone(),
        connections.get_ref().clone(),
        Some(handshake),
    )
    .map_err(|e| anyhow::anyhow!("{}", e))?;

    Ok(sse_response)
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SpanStartUpdate {
    span_id: Uuid,
    name: String,
    start_time: DateTime<Utc>,
    trace_id: Uuid,
    parent_span_id: Option<Uuid>,
    #[serde(default)]
    span_type: SpanType,
}

#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum SpanUpdateRequest {
    SpanStart(SpanStartUpdate),
}

#[patch("rollouts/{session_id}/updates")]
pub async fn send_span_update(
    path: web::Path<Uuid>,
    body: web::Json<SpanUpdateRequest>,
    project_api_key: ProjectApiKey,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let session_id = path.into_inner();
    let project_id = project_api_key.project_id;
    let payload = body.into_inner();

    match payload {
        SpanUpdateRequest::SpanStart(span) => {
            let message = SseMessage {
                event_type: "span_start".to_string(),
                data: serde_json::json!({
                    "span": span,
                }),
            };
            let key = format!("rollout_session_{}", session_id);
            send_to_key(pubsub.get_ref().as_ref(), &project_id, &key, message).await;
        }
    }

    Ok(HttpResponse::Ok().finish())
}

#[patch("rollouts/{session_id}/status")]
pub async fn update_status(
    path: web::Path<Uuid>,
    body: web::Json<UpdateStatusRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id = path.into_inner();
    let project_id = project_api_key.project_id;
    let new_status = body.into_inner().status;

    // Update status in database
    update_session_status(&db.pool, &session_id, &project_id, new_status).await?;

    // Send status update to frontend via SSE
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

#[delete("rollouts/{session_id}")]
pub async fn delete(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id =
        Uuid::parse_str(&path.into_inner()).map_err(|_| anyhow::anyhow!("Invalid session ID"))?;
    let project_id = project_api_key.project_id;

    delete_rollout_session(&db.pool, &session_id, &project_id).await?;

    Ok(HttpResponse::Ok().finish())
}
