use actix_web::{HttpResponse, patch, post, web};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    api::v1::rollouts::UpdateStatusRequest,
    db::{
        DB,
        rollout_sessions::{RolloutSessionStatus, update_session_status},
    },
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

#[derive(Deserialize, Serialize)]
#[serde(untagged)]
enum Args {
    KeyValue(HashMap<String, Value>),
    Array(Vec<Value>),
}

impl Default for Args {
    fn default() -> Self {
        Self::KeyValue(HashMap::new())
    }
}

#[derive(Deserialize, Serialize)]
struct RunRequest {
    #[serde(default)]
    pub trace_id: Option<Uuid>,
    #[serde(default)]
    pub path_to_count: HashMap<String, u32>,
    #[serde(default)]
    pub args: Args,
    #[serde(default)]
    pub overrides: HashMap<String, SpanOverride>,
}

#[derive(Deserialize, Serialize)]
struct SpanOverride {
    pub system: String,
    #[serde(default)]
    pub tools: Vec<Value>,
}

#[post("rollouts/{session_id}/run")]
pub async fn run(
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<RunRequest>,
    pubsub: web::Data<Arc<PubSub>>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (project_id, session_id) = path.into_inner();

    let message = SseMessage {
        event_type: "run".to_string(),
        data: serde_json::to_value(body.into_inner())?,
    };

    // Update status in database
    update_session_status(
        &db.pool,
        &session_id,
        &project_id,
        RolloutSessionStatus::Running,
    )
    .await?;

    // Send to specific rollout session subscription key
    let key = format!("rollout_sdk_{}", session_id);
    send_to_key(pubsub.get_ref().as_ref(), &project_id, &key, message).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "Rollout started successfully" })))
}

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

    // Update status in database
    update_session_status(&db.pool, &session_id, &project_id, new_status).await?;

    if new_status == RolloutSessionStatus::Stopped {
        // Send status update to frontend via SSE
        let message: SseMessage = SseMessage {
            event_type: "stop".to_string(),
            data: serde_json::json!({
                "session_id": session_id,
            }),
        };
        let key = format!("rollout_sdk_{}", session_id);
        send_to_key(pubsub.get_ref().as_ref(), &project_id, &key, message).await;
    }

    Ok(HttpResponse::Ok().finish())
}
