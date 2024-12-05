use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::opentelemetry::opentelemetry_proto_trace_v1::span::Event as OtelEvent;

use super::utils::convert_any_value_to_json_value;

#[derive(Deserialize, Serialize, Clone, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: Uuid,
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub timestamp: DateTime<Utc>,
    pub name: String,
    pub attributes: Value,
}

impl Event {
    pub fn from_otel(event: OtelEvent, span_id: Uuid, project_id: Uuid) -> Self {
        let attributes = event
            .attributes
            .into_iter()
            .map(|kv| (kv.key, convert_any_value_to_json_value(kv.value)))
            .collect::<serde_json::Map<String, serde_json::Value>>();

        Self {
            id: Uuid::new_v4(),
            span_id,
            project_id,
            created_at: Utc::now(),
            timestamp: Utc.timestamp_nanos(event.time_unix_nano as i64),
            name: event.name,
            attributes: Value::Object(attributes),
        }
    }
}

pub async fn get_events_for_span(pool: &PgPool, span_id: Uuid) -> Result<Vec<Event>> {
    let events = sqlx::query_as::<_, Event>(
        "SELECT
            e.id,
            e.created_at,
            e.span_id,
            e.project_id,
            e.timestamp,
            e.name,
            e.attributes
        FROM events e
        WHERE span_id = $1
        ORDER BY e.timestamp ASC",
    )
    .bind(span_id)
    .fetch_all(pool)
    .await?;

    Ok(events)
}

pub async fn insert_events(pool: &PgPool, events: &Vec<Event>) -> Result<()> {
    let span_ids = events.iter().map(|e| e.span_id).collect::<Vec<Uuid>>();
    let project_ids = events.iter().map(|e| e.project_id).collect::<Vec<Uuid>>();
    let timestamps = events
        .iter()
        .map(|e| e.timestamp)
        .collect::<Vec<DateTime<Utc>>>();
    let names = events
        .iter()
        .map(|e| e.name.clone())
        .collect::<Vec<String>>();
    let attributes = events
        .iter()
        .map(|e| e.attributes.clone())
        .collect::<Vec<Value>>();

    sqlx::query(
        "INSERT INTO events (span_id, project_id, timestamp, name, attributes)
        VALUES (UNNEST($1), UNNEST($2), UNNEST($3), UNNEST($4), UNNEST($5))
        ",
    )
    .bind(span_ids)
    .bind(project_ids)
    .bind(timestamps)
    .bind(names)
    .bind(attributes)
    .execute(pool)
    .await?;

    Ok(())
}
