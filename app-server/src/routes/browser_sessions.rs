use actix_web::{post, web, HttpResponse};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
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
    window_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct EventMetrics {
    node_id: Option<i32>,
    position_x: Option<f32>,
    position_y: Option<f32>,
    viewport_width: Option<i32>,
    viewport_height: Option<i32>,
}

impl EventMetrics {
    fn from_event(event: &RRWebEvent) -> Self {
        let data = &event.data;
        match event.event_type {
            2 => Self {
                // DOM snapshot
                node_id: data
                    .get("node")
                    .and_then(|n| n.get("id"))
                    .and_then(|id| id.as_i64())
                    .map(|id| id as i32),
                ..Default::default()
            },
            3 => Self {
                // Mouse event
                position_x: data
                    .get("positions")
                    .and_then(|p| p[0].get("x"))
                    .and_then(|x| x.as_f64())
                    .map(|x| x as f32),
                position_y: data
                    .get("positions")
                    .and_then(|p| p[0].get("y"))
                    .and_then(|y| y.as_f64())
                    .map(|y| y as f32),
                ..Default::default()
            },
            4 => Self {
                // Viewport
                viewport_width: data.get("width").and_then(|w| w.as_i64()).map(|w| w as i32),
                viewport_height: data
                    .get("height")
                    .and_then(|h| h.as_i64())
                    .map(|h| h as i32),
                ..Default::default()
            },
            _ => Self::default(),
        }
    }
}

impl Default for EventMetrics {
    fn default() -> Self {
        Self {
            node_id: None,
            position_x: None,
            position_y: None,
            viewport_width: None,
            viewport_height: None,
        }
    }
}

#[post("browser-sessions/events")]
async fn create_session_event(
    clickhouse: web::Data<clickhouse::Client>,
    batch: web::Json<EventBatch>,
) -> ResponseResult {
    for event in &batch.events {
        let metrics = EventMetrics::from_event(event);
        clickhouse
            .query(
                "
                INSERT INTO browser_session_events (
                    uuid, session_id, window_id, timestamp,
                    event_type, data,
                    node_id, position_x, position_y,
                    viewport_width, viewport_height
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(Uuid::new_v4())
            .bind(batch.session_id)
            .bind(batch.window_id.clone().unwrap_or_default())
            .bind(event.timestamp)
            .bind(event.event_type)
            .bind(event.data.to_string())
            .bind(metrics.node_id)
            .bind(metrics.position_x)
            .bind(metrics.position_y)
            .bind(metrics.viewport_width)
            .bind(metrics.viewport_height)
            .execute()
            .await?;
    }

    Ok(HttpResponse::Ok().finish())
}
