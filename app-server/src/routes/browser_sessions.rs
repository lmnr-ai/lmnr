use actix_web::{post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::routes::ResponseResult;

#[derive(Debug, Serialize, Deserialize)]
struct RRWebEvent {
    #[serde(rename = "type")]
    event_type: i32,
    timestamp: i64,
    data: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventBatch {
    events: Vec<RRWebEvent>,
    session_id: Uuid,
    trace_id: Uuid,
    window_id: Option<String>,
}

#[post("browser-sessions/events")]
async fn create_session_event(
    clickhouse: web::Data<clickhouse::Client>,
    batch: web::Json<EventBatch>,
) -> ResponseResult {
    for event in &batch.events {
        clickhouse
            .query(
                "
                INSERT INTO browser_session_events (
                    event_id, session_id, trace_id, window_id, timestamp,
                    event_type, data
                ) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(Uuid::new_v4())
            .bind(batch.session_id)
            .bind(batch.trace_id)
            .bind(batch.window_id.clone().unwrap_or_default())
            .bind(event.timestamp)
            .bind(event.event_type)
            .bind(event.data.to_string())
            .execute()
            .await?;
    }

    Ok(HttpResponse::Ok().finish())
}
