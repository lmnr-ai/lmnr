use std::sync::Arc;

use actix_web::{options, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{db::project_api_keys::ProjectApiKey, mq, routes::types::ResponseResult};

pub const BROWSER_SESSIONS_QUEUE: &str = "browser_sessions_queue";
pub const BROWSER_SESSIONS_EXCHANGE: &str = "browser_sessions_exchange";
pub const BROWSER_SESSIONS_ROUTING_KEY: &str = "browser_sessions_routing_key";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RRWebEvent {
    #[serde(rename = "type")]
    pub event_type: i32,
    pub timestamp: i64,
    pub data: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventBatch {
    pub events: Vec<RRWebEvent>,
    pub session_id: Uuid,
    pub trace_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueueBrowserEventMessage {
    pub batch: EventBatch,
    pub project_id: Uuid,
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
    queue: web::Data<Arc<dyn mq::MessageQueue<QueueBrowserEventMessage>>>,
) -> ResponseResult {
    // Skip if there are no events
    queue
        .publish(
            &QueueBrowserEventMessage {
                batch: batch.into_inner(),
                project_id: project_api_key.project_id,
            },
            BROWSER_SESSIONS_EXCHANGE,
            BROWSER_SESSIONS_ROUTING_KEY,
        )
        .await?;

    Ok(HttpResponse::Ok().finish())
}
