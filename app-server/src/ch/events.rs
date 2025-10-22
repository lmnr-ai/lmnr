use anyhow::Result;
use clickhouse::Row;
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::db::events::Event;

use super::utils::chrono_to_nanoseconds;

#[derive(Row, Serialize)]
pub struct CHEvent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// Timestamp in nanoseconds
    pub timestamp: i64,
    pub name: String,
    pub attributes: String,
    pub user_id: String,
    pub session_id: String,
    pub size_bytes: u64,
}

impl CHEvent {
    pub fn from_db_event(event: &Event) -> Self {
        CHEvent {
            id: event.id,
            span_id: event.span_id,
            trace_id: event.trace_id,
            timestamp: chrono_to_nanoseconds(event.timestamp),
            name: event.name.clone(),
            project_id: event.project_id,
            attributes: event.attributes.to_string(),
            user_id: Self::get_string_key_from_attributes(&event.attributes, "lmnr.event.user_id"),
            session_id: Self::get_string_key_from_attributes(
                &event.attributes,
                "lmnr.event.session_id",
            ),
            size_bytes: event.estimate_size_bytes() as u64,
        }
    }

    fn get_string_key_from_attributes(attributes: &Value, key: &str) -> String {
        match attributes.get(key) {
            Some(value) => value.as_str().unwrap_or("").to_string(),
            None => "".to_string(),
        }
    }
}

/// Insert events into ClickHouse and return the number of bytes inserted
pub async fn insert_events(clickhouse: clickhouse::Client, events: Vec<CHEvent>) -> Result<usize> {
    if events.is_empty() {
        return Ok(0);
    }

    let ch_insert = clickhouse.insert("events");
    match ch_insert {
        Ok(mut ch_insert) => {
            let mut total_size_bytes = 0;
            for event in events {
                ch_insert.write(&event).await?;
                total_size_bytes += event.size_bytes as usize;
            }
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(total_size_bytes),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse events insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert events into Clickhouse: {:?}",
                e
            ));
        }
    }
}
