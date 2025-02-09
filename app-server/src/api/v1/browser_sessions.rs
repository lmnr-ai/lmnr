use actix_web::{options, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{db::project_api_keys::ProjectApiKey, routes::types::ResponseResult};

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
    clickhouse: web::Data<clickhouse::Client>,
    batch: web::Json<EventBatch>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    // Skip if there are no events
    if batch.events.is_empty() {
        return Ok(HttpResponse::Ok().finish());
    }

    // Prepare batch data
    let mut query = String::from(
        "
        INSERT INTO browser_session_events (
            event_id, session_id, trace_id, timestamp,
            event_type, data, project_id
        )
        VALUES ",
    );

    let mut values = Vec::new();

    for (i, event) in batch.events.iter().enumerate() {
        if i > 0 {
            query.push_str(", ");
        }
        query.push_str("(?, ?, ?, ?, ?, ?, ?)");

        // Add each value individually
        values.extend_from_slice(&[
            Uuid::new_v4().to_string(),
            batch.session_id.to_string(),
            batch.trace_id.to_string(),
            event.timestamp.to_string(),
            event.event_type.to_string(),
            event.data.to_string(),
            project_api_key.project_id.to_string(),
        ]);
    }

    // Execute batch insert with individual bindings
    let mut query_with_bindings = clickhouse.query(&query);
    for value in values {
        query_with_bindings = query_with_bindings.bind(value);
    }
    query_with_bindings.execute().await?;

    Ok(HttpResponse::Ok().finish())
}
