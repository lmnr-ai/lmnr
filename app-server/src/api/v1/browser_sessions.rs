use std::sync::Arc;

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Deserializer, Serialize};
use uuid::Uuid;

use crate::{
    browser_events::QueueBrowserEventMessage,
    db::{DB, project_api_keys::ProjectApiKey},
    features::{Feature, is_feature_enabled},
    mq::{MessageQueue, MessageQueueTrait},
    routes::types::ResponseResult,
    traces::limits::get_workspace_limit_exceeded_by_project_id,
};

pub const BROWSER_SESSIONS_QUEUE: &str = "browser_sessions_queue";
pub const BROWSER_SESSIONS_EXCHANGE: &str = "browser_sessions_exchange";
pub const BROWSER_SESSIONS_ROUTING_KEY: &str = "browser_sessions_routing_key";

// Custom deserializer for the data field to support both Vec<u8> and base64 string
fn deserialize_data<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::Error;

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum DataFormat {
        Bytes(Vec<u8>),
        Base64String(String),
    }

    match DataFormat::deserialize(deserializer)? {
        DataFormat::Bytes(bytes) => Ok(bytes),
        DataFormat::Base64String(s) => {
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &s)
                .map_err(|e| Error::custom(format!("Invalid base64: {}", e)))
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RRWebEvent {
    #[serde(rename = "type")]
    pub event_type: u8,
    pub timestamp: f64, // milliseconds
    #[serde(deserialize_with = "deserialize_data")]
    pub data: Vec<u8>,
}

impl RRWebEvent {
    pub fn estimate_size_bytes(&self) -> usize {
        // 1 byte for event_type, 8 bytes for timestamp
        9 + self.data.len()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventBatch {
    pub events: Vec<RRWebEvent>,
    pub session_id: Uuid,
    pub trace_id: Uuid,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub sdk_version: Option<String>,
}

#[post("events")]
async fn create_session_event(
    batch: web::Json<EventBatch>,
    project_api_key: ProjectApiKey,
    queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    cache: web::Data<crate::cache::Cache>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let filtered_batch = batch.into_inner();

    // Return 400 Bad Request if trace_id is null (00000000-0000-0000-0000-000000000000)
    if filtered_batch.trace_id == Uuid::nil() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid trace_id: must not be null (00000000-0000-0000-0000-000000000000)"
        })));
    }

    if is_feature_enabled(Feature::UsageLimit) {
        let limits_exceeded = get_workspace_limit_exceeded_by_project_id(
            db.into_inner(),
            clickhouse.into_inner().as_ref().clone(),
            cache.into_inner(),
            project_api_key.project_id,
        )
        .await?;

        if limits_exceeded.bytes_ingested {
            return Ok(HttpResponse::PaymentRequired().json("Workspace data limit exceeded"));
        }
    }

    let message = QueueBrowserEventMessage {
        batch: filtered_batch,
        project_id: project_api_key.project_id,
    };

    queue
        .publish(
            &serde_json::to_vec(&message).unwrap(),
            BROWSER_SESSIONS_EXCHANGE,
            BROWSER_SESSIONS_ROUTING_KEY,
        )
        .await?;

    Ok(HttpResponse::Ok().finish())
}
