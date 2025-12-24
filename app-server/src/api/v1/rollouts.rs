use actix_web::{HttpResponse, delete, post, web};
use uuid::Uuid;

use crate::{
    db::{
        DB,
        project_api_keys::ProjectApiKey,
        rollout_sessions::{create_rollout_session, delete_rollout_session, get_rollout_session},
    },
    realtime::{SseConnectionMap, SseMessage, create_sse_response},
    routes::types::ResponseResult,
};

#[derive(serde::Deserialize, serde::Serialize)]
pub struct InputParam {
    pub name: String,
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
    let key = format!("rollout_{}", session_id);
    let sse_response = create_sse_response(
        project_id,
        key.clone(),
        connections.get_ref().clone(),
        Some(handshake),
    )
    .map_err(|e| anyhow::anyhow!("{}", e))?;

    Ok(sse_response)
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
