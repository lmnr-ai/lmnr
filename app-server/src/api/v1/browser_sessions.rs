use std::sync::Arc;

use actix_web::{options, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    browser_events::QueueBrowserEventMessage,
    db::project_api_keys::ProjectApiKey,
    mq::{MessageQueue, MessageQueueTrait},
    routes::types::ResponseResult,
};

pub const BROWSER_SESSIONS_QUEUE: &str = "browser_sessions_queue";
pub const BROWSER_SESSIONS_EXCHANGE: &str = "browser_sessions_exchange";
pub const BROWSER_SESSIONS_ROUTING_KEY: &str = "browser_sessions_routing_key";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RRWebEvent {
    #[serde(rename = "type")]
    pub event_type: i32,
    pub timestamp: i64,
    // #[serde(borrow)]
    pub data: Box<serde_json::value::RawValue>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventBatch {
    pub events: Vec<RRWebEvent>,
    pub session_id: Uuid,
    pub trace_id: Uuid,
}

#[options("events")]
async fn options_handler() -> ResponseResult {
    Ok(HttpResponse::Ok()
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .insert_header(("Access-Control-Allow-Methods", "POST, OPTIONS"))
        .insert_header((
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type, Content-Encoding, Accept",
        ))
        .insert_header(("Access-Control-Max-Age", "86400"))
        .finish())
}

#[post("events")]
async fn create_session_event(
    batch: web::Json<EventBatch>,
    project_api_key: ProjectApiKey,
    queue: web::Data<Arc<MessageQueue>>,
) -> ResponseResult {
    let filtered_batch = batch.into_inner();

    // Return 400 Bad Request if trace_id is null (00000000-0000-0000-0000-000000000000)
    if filtered_batch.trace_id == Uuid::nil() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid trace_id: must not be null (00000000-0000-0000-0000-000000000000)"
        })));
    }

    let message = QueueBrowserEventMessage {
        batch: filtered_batch,
        project_id: project_api_key.project_id,
    };

    queue
        .publish(
            &bincode::serialize(&message).unwrap(),
            BROWSER_SESSIONS_EXCHANGE,
            BROWSER_SESSIONS_ROUTING_KEY,
        )
        .await?;

    Ok(HttpResponse::Ok().finish())
}
