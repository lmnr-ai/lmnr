use actix_web::{options, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{self, project_api_keys::ProjectApiKey, DB},
    routes::types::ResponseResult,
};

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

#[options("events")]
async fn options_handler() -> ResponseResult {
    // TODO: use cors middleware from actix_cors crate
    Ok(HttpResponse::Ok()
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .insert_header(("Access-Control-Allow-Methods", "POST, OPTIONS"))
        .insert_header((
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type",
        ))
        .insert_header(("Access-Control-Max-Age", "86400"))
        .finish())
}

#[post("events")]
async fn create_session_event(
    clickhouse: web::Data<clickhouse::Client>,
    db: web::Data<DB>,
    batch: web::Json<EventBatch>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    // update has_browser_session field in the traces table
    db::trace::update_trace_has_browser_session(
        &db.pool,
        &project_api_key.project_id,
        &batch.trace_id,
    )
    .await?;

    for event in &batch.events {
        clickhouse
            .query(
                "
                INSERT INTO browser_session_events (
                    event_id, session_id, trace_id, window_id, timestamp,
                    event_type, data, project_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(Uuid::new_v4())
            .bind(batch.session_id)
            .bind(batch.trace_id)
            .bind(batch.window_id.clone().unwrap_or_default())
            .bind(event.timestamp)
            .bind(event.event_type)
            .bind(event.data.to_string())
            .bind(project_api_key.project_id)
            .execute()
            .await?;
    }

    Ok(HttpResponse::Ok().finish())
}
