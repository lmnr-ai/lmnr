use anyhow::Result;
use clickhouse::Row;
use serde::Serialize;
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
    /// Timestamp in nanoseconds
    pub timestamp: i64,
    pub name: String,
}

impl CHEvent {
    pub fn from_db_event(event: &Event) -> Self {
        CHEvent {
            id: event.id,
            span_id: event.span_id,
            timestamp: chrono_to_nanoseconds(event.timestamp),
            name: event.name.clone(),
            project_id: event.project_id,
        }
    }
}

pub async fn insert_events(clickhouse: clickhouse::Client, events: Vec<CHEvent>) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert("events");
    match ch_insert {
        Ok(mut ch_insert) => {
            for event in events {
                ch_insert.write(&event).await?;
            }
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
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
