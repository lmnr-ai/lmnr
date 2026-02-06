use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::utils::chrono_to_nanoseconds;

/// ClickHouse representation of a signal event
#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHSignalEvent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub run_id: Uuid,
    pub name: String,
    summary: String,
    /// JSON-serialized payload/attributes
    pub payload: String,
    /// Timestamp in nanoseconds
    pub timestamp: i64,
}

impl CHSignalEvent {
    pub fn new(
        id: Uuid,
        project_id: Uuid,
        signal_id: Uuid,
        trace_id: Uuid,
        run_id: Uuid,
        name: String,
        payload: Value,
        timestamp: chrono::DateTime<chrono::Utc>,
        summary: String,
    ) -> Self {
        Self {
            id,
            project_id,
            signal_id,
            trace_id,
            run_id,
            name,
            payload: payload.to_string(),
            timestamp: chrono_to_nanoseconds(timestamp),
            summary,
        }
    }

    /// Get the name of the signal event
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the payload as a parsed JSON Value
    pub fn payload_value(&self) -> Result<Value> {
        serde_json::from_str(&self.payload)
            .map_err(|e| anyhow::anyhow!("Failed to parse payload: {}", e))
    }
}

/// Insert signal events into ClickHouse
pub async fn insert_signal_events(
    clickhouse: clickhouse::Client,
    events: Vec<CHSignalEvent>,
) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert::<CHSignalEvent>("signal_events").await;
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert = ch_insert.with_option("wait_for_async_insert", "0");
            for event in events {
                ch_insert.write(&event).await?;
            }
            ch_insert.end().await.map_err(|e| {
                anyhow::anyhow!("Clickhouse signal_events insertion failed: {:?}", e)
            })?;
            Ok(())
        }
        Err(e) => Err(anyhow::anyhow!(
            "Failed to insert signal events into Clickhouse: {:?}",
            e
        )),
    }
}
