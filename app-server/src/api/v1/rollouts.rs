use actix_web::{HttpResponse, delete, post, web};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    db::{
        DB,
        project_api_keys::ProjectApiKey,
        rollout_sessions::{create_rollout_session, delete_rollout_session, get_rollout_session},
    },
    pubsub::PubSub,
    realtime::{SseConnectionMap, SseMessage, create_sse_response, send_to_key},
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
    let session_id = Uuid::parse_str(&path.into_inner()).unwrap();
    let project_id = project_api_key.project_id;

    // Create rollout session if not exists
    if get_rollout_session(&db.pool, &session_id, &project_id)
        .await?
        .is_none()
    {
        let params = serde_json::to_value(body.into_inner().params)?;
        create_rollout_session(&db.pool, &session_id, &project_id, params).await?;
    }

    // Start stream
    let key = format!("rollout_{}", session_id);
    let sse_response = create_sse_response(project_id, key, connections.get_ref().clone())
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    Ok(sse_response)
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct SpanOverride {
    pub system: String,
    pub tools: Vec<Value>,
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct RunRequest {
    pub trace_id: Uuid,
    pub path_to_count: HashMap<String, u32>,
    pub args: HashMap<String, Value>,
    pub overrides: HashMap<String, SpanOverride>,
}

#[post("rollouts/{session_id}/run")]
pub async fn run(
    path: web::Path<String>,
    body: web::Json<RunRequest>,
    project_api_key: ProjectApiKey,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let session_id = Uuid::parse_str(&path.into_inner()).unwrap();
    let project_id = project_api_key.project_id;

    let message = SseMessage {
        event_type: "run".to_string(),
        data: serde_json::to_value(body.into_inner())?,
    };

    // Send to specific rollout session subscription key
    let key = format!("rollout_{}", session_id);
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
    let session_id = Uuid::parse_str(&path.into_inner()).unwrap();
    let project_id = project_api_key.project_id;

    delete_rollout_session(&db.pool, &session_id, &project_id).await?;

    Ok(HttpResponse::Ok().finish())
}
