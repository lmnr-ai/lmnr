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
    /// JSON-serialized payload/attributes
    pub payload: String,
    /// Timestamp in nanoseconds
    pub timestamp: i64,
    pub summary: String,
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

/// ClickHouse row for report signal event samples
#[derive(Row, Serialize, Deserialize, Debug)]
pub struct SignalEventSampleRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub name: String,
    pub payload: String,
    pub summary: String,
    pub timestamp: i64,
}

/// ClickHouse row for signal event counts
#[derive(Row, Serialize, Deserialize, Debug)]
pub struct SignalEventCountRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    pub count: u64,
}

/// Get event counts per signal for the given project and time range.
pub async fn get_signal_event_counts(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_ids: &[Uuid],
    start_ts: i64,
    end_ts: i64,
) -> Result<Vec<SignalEventCountRow>> {
    if signal_ids.is_empty() {
        return Ok(vec![]);
    }

    let placeholders: Vec<String> = signal_ids.iter().map(|_| "?".to_string()).collect();
    let query_str = format!(
        "SELECT signal_id, count() as count
         FROM signal_events
         WHERE project_id = ?
           AND signal_id IN ({})
           AND timestamp >= toDateTime64(?, 9)
           AND timestamp < toDateTime64(?, 9)
         GROUP BY signal_id",
        placeholders.join(",")
    );

    let mut query = clickhouse.query(&query_str).bind(project_id);

    for signal_id in signal_ids {
        query = query.bind(signal_id);
    }

    query = query.bind(start_ts).bind(end_ts);

    let rows = query.fetch_all::<SignalEventCountRow>().await?;

    Ok(rows)
}

/// Get the most recent N sample events per signal for the given project and time range.
pub async fn get_signal_event_samples(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_ids: &[Uuid],
    start_ts: i64,
    end_ts: i64,
    limit_per_signal: u64,
) -> Result<Vec<SignalEventSampleRow>> {
    if signal_ids.is_empty() {
        return Ok(vec![]);
    }

    let placeholders: Vec<String> = signal_ids.iter().map(|_| "?".to_string()).collect();

    let query_str = format!(
        "SELECT id, signal_id, trace_id, name, payload, summary, timestamp
         FROM (
             SELECT id, signal_id, trace_id, name, payload, summary, timestamp,
                    row_number() OVER (PARTITION BY signal_id ORDER BY timestamp DESC) as rn
             FROM signal_events
             WHERE project_id = ?
               AND signal_id IN ({})
               AND timestamp >= toDateTime64(?, 9)
               AND timestamp < toDateTime64(?, 9)
         )
         WHERE rn <= ?
         ORDER BY signal_id, timestamp DESC",
        placeholders.join(",")
    );

    let mut query = clickhouse.query(&query_str).bind(project_id);

    for signal_id in signal_ids {
        query = query.bind(signal_id);
    }

    query = query.bind(start_ts).bind(end_ts).bind(limit_per_signal);

    let rows = query.fetch_all::<SignalEventSampleRow>().await?;

    Ok(rows)
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
