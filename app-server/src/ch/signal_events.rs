#![cfg_attr(not(feature = "signals"), allow(dead_code))]

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
    /// 0 = info, 1 = warning, 2 = critical
    pub severity: u8,
}

impl CHSignalEvent {
    #[allow(clippy::too_many_arguments)]
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
        severity: u8,
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
            severity,
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

/// ClickHouse row for signal events used as LLM summary context
#[derive(Row, Serialize, Deserialize, Debug)]
pub struct SignalEventContextRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub summary: String,
    pub payload: String,
    pub timestamp: i64,
    pub severity: u8,
}

/// Get the most recent signal events (up to `limit`) for the given project and time range.
/// Returns id, signal_id, trace_id, summary, and payload for use as LLM summary context.
pub async fn get_signal_events_for_summary(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_ids: &[Uuid],
    start_ts: i64,
    end_ts: i64,
    limit: u64,
) -> Result<Vec<SignalEventContextRow>> {
    if signal_ids.is_empty() {
        return Ok(vec![]);
    }

    let placeholders: Vec<String> = signal_ids.iter().map(|_| "?".to_string()).collect();

    let query_str = format!(
        "SELECT id, signal_id, trace_id, summary, payload, timestamp, severity
         FROM signal_events
         WHERE project_id = ?
           AND signal_id IN ({})
           AND timestamp >= toDateTime64(?, 9)
           AND timestamp < toDateTime64(?, 9)
         ORDER BY timestamp DESC
         LIMIT ?",
        placeholders.join(",")
    );

    let mut query = clickhouse.query(&query_str).bind(project_id);

    for signal_id in signal_ids {
        query = query.bind(signal_id);
    }

    query = query.bind(start_ts).bind(end_ts).bind(limit);

    let rows = query.fetch_all::<SignalEventContextRow>().await?;

    Ok(rows)
}

/// Fetch signal events by their IDs, filtering by project_id and signal_id
/// to utilize the ClickHouse ordering key efficiently.
pub async fn get_signal_events_by_ids(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_id: &Uuid,
    event_ids: &[Uuid],
) -> Result<Vec<CHSignalEvent>> {
    if event_ids.is_empty() {
        return Ok(vec![]);
    }

    let placeholders: Vec<String> = event_ids.iter().map(|_| "?".to_string()).collect();
    let query_str = format!(
        "SELECT id, project_id, signal_id, trace_id, run_id, name, payload, timestamp, summary, severity
         FROM signal_events
         WHERE project_id = ?
           AND signal_id = ?
           AND id IN ({})",
        placeholders.join(",")
    );

    let mut query = clickhouse
        .query(&query_str)
        .bind(project_id)
        .bind(signal_id);

    for event_id in event_ids {
        query = query.bind(event_id);
    }

    let rows = query.fetch_all::<CHSignalEvent>().await?;

    Ok(rows)
}

/// Aggregate stats for a cluster's linked events.
#[derive(Row, Serialize, Deserialize, Debug, Default)]
pub struct ClusterEventStats {
    /// Nanoseconds since epoch; 0 when the cluster has no events.
    pub first_seen: i64,
    pub last_seen: i64,
    pub info_count: u64,
    pub warning_count: u64,
    pub critical_count: u64,
}

/// Get first/last seen timestamps and severity counts for a cluster's events.
pub async fn get_cluster_event_stats(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_id: &Uuid,
    cluster_id: &Uuid,
) -> Result<ClusterEventStats> {
    let query_str = "SELECT
            min(timestamp) as first_seen,
            max(timestamp) as last_seen,
            countIf(severity = 0) as info_count,
            countIf(severity = 1) as warning_count,
            countIf(severity = 2) as critical_count
         FROM signal_events
         WHERE project_id = ?
           AND signal_id = ?
           AND id IN (
             SELECT event_id FROM events_to_clusters FINAL
             WHERE project_id = ? AND cluster_id = ?
           )";

    let stats = clickhouse
        .query(query_str)
        .bind(project_id)
        .bind(signal_id)
        .bind(project_id)
        .bind(cluster_id)
        .fetch_one::<ClusterEventStats>()
        .await?;

    Ok(stats)
}

/// A representative signal event for a cluster notification.
#[derive(Row, Serialize, Deserialize, Debug)]
pub struct ClusterEventSample {
    pub name: String,
    pub summary: String,
    pub severity: u8,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// Nanoseconds since epoch.
    pub timestamp: i64,
}

/// Get up to `limit` representative events for a cluster, most severe and recent first.
pub async fn get_cluster_event_samples(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_id: &Uuid,
    cluster_id: &Uuid,
    limit: u32,
) -> Result<Vec<ClusterEventSample>> {
    let query_str = "SELECT name, summary, severity, trace_id, timestamp
         FROM signal_events
         WHERE project_id = ?
           AND signal_id = ?
           AND id IN (
             SELECT event_id FROM events_to_clusters FINAL
             WHERE project_id = ? AND cluster_id = ?
           )
         ORDER BY severity DESC, timestamp DESC
         LIMIT ?";

    let rows = clickhouse
        .query(query_str)
        .bind(project_id)
        .bind(signal_id)
        .bind(project_id)
        .bind(cluster_id)
        .bind(limit)
        .fetch_all::<ClusterEventSample>()
        .await?;

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
            ch_insert = ch_insert.with_setting("wait_for_async_insert", "0");
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
