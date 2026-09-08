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
    /// LEGACY — written empty for new events; readers fall back to this
    /// column for pre-existing rows. New events carry `summaries` instead.
    pub summary: String,
    /// The finding's clustering summaries — one short string per distinct
    /// issue. Each is also written as its own `events_to_clusters.content`
    /// membership row (kept there for fast per-cluster lookup at naming time).
    pub summaries: Vec<String>,
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

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct SignalEventBucketRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    pub bucket_index: u32,
    pub count: u64,
}

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct SignalClusterCountRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub cluster_id: Uuid,
    pub cluster_name: String,
    pub current_count: u64,
    pub previous_count: u64,
}

/// Get fixed-width event buckets for each signal in a report period.
pub async fn get_signal_event_buckets(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_ids: &[Uuid],
    start_ts: i64,
    end_ts: i64,
    bucket_count: u32,
) -> Result<Vec<SignalEventBucketRow>> {
    if signal_ids.is_empty() || bucket_count == 0 || end_ts <= start_ts {
        return Ok(vec![]);
    }
    let placeholders = vec!["?"; signal_ids.len()].join(",");
    let bucket_seconds = ((end_ts - start_ts) as u64).div_ceil(bucket_count as u64);
    let query_str = format!(
        "SELECT signal_id,
                toUInt32(intDiv(toUnixTimestamp(timestamp) - ?, {bucket_seconds})) AS bucket_index,
                count() AS count
         FROM signal_events
         WHERE project_id = ? AND signal_id IN ({placeholders})
           AND timestamp >= toDateTime64(?, 9) AND timestamp < toDateTime64(?, 9)
         GROUP BY signal_id, bucket_index"
    );
    let mut query = clickhouse.query(&query_str).bind(start_ts).bind(project_id);
    for signal_id in signal_ids {
        query = query.bind(signal_id);
    }
    Ok(query
        .bind(start_ts)
        .bind(end_ts)
        .fetch_all::<SignalEventBucketRow>()
        .await?)
}

/// Count current and previous-period event memberships for every named cluster.
pub async fn get_signal_cluster_counts(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_ids: &[Uuid],
    previous_start_ts: i64,
    current_start_ts: i64,
    current_end_ts: i64,
) -> Result<Vec<SignalClusterCountRow>> {
    if signal_ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = vec!["?"; signal_ids.len()].join(",");
    let query_str = format!(
        "SELECT c.signal_id AS signal_id, c.id AS cluster_id, c.name AS cluster_name,
                countIf(e.timestamp >= toDateTime64(?, 9)) AS current_count,
                countIf(e.timestamp < toDateTime64(?, 9)) AS previous_count
         FROM events_to_clusters AS ec FINAL
         INNER JOIN signal_event_clusters AS c FINAL
           ON ec.project_id = c.project_id AND ec.cluster_id = c.id
         INNER JOIN signal_events AS e
           ON ec.project_id = e.project_id AND ec.event_id = e.id
         WHERE ec.project_id = ? AND c.signal_id IN ({placeholders}) AND c.level > 0
           AND e.timestamp >= toDateTime64(?, 9) AND e.timestamp < toDateTime64(?, 9)
         GROUP BY c.signal_id, c.id, c.name"
    );
    let mut query = clickhouse
        .query(&query_str)
        .bind(current_start_ts)
        .bind(current_start_ts)
        .bind(project_id);
    for signal_id in signal_ids {
        query = query.bind(signal_id);
    }
    Ok(query
        .bind(previous_start_ts)
        .bind(current_end_ts)
        .fetch_all::<SignalClusterCountRow>()
        .await?)
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
///
/// `summary` is resolved from the event's `summaries` array (joined with
/// `'; '`), falling back to the legacy `summary` column for pre-existing rows
/// written before summaries moved to the array.
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
        "SELECT id, signal_id, trace_id,
                if(notEmpty(summaries), arrayStringConcat(summaries, '; '), summary) AS summary,
                payload, timestamp, severity
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
