use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};

#[derive(Deserialize, Serialize)]
struct RunRequest {
    pub trace_id: Option<Uuid>,
    pub path_to_count: HashMap<String, u32>,
    pub args: HashMap<String, Value>,
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
) -> ResponseResult {
    let (project_id, session_id) = path.into_inner();

    let message = SseMessage {
        event_type: "run".to_string(),
        data: serde_json::to_value(body.into_inner())?,
    };

    // Send to specific rollout session subscription key
    let key = format!("rollout_{}", session_id);
    send_to_key(pubsub.get_ref().as_ref(), &project_id, &key, message).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "Rollout started successfully" })))
}
