use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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
