//! `trace_signal_events`: signal events and their cluster memberships keyed by
//! trace, so `traces_v0` exposes `signals` / `clusters` without joining the
//! (large) `signal_events` and `events_to_clusters` tables.
//!
//! One row per `(trace, event, cluster, summary)`. Event creation writes
//! placeholder rows with a nil `cluster_id` (so the trace shows the signal
//! immediately); the clusterer then mirrors each membership it assigns as a
//! row carrying the real `cluster_id`. `ReplacingMergeTree(updated_at)` on
//! that key makes both writes idempotent.

use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::signal_events::CHSignalEvent;

pub const TRACE_SIGNAL_EVENTS_TABLE: &str = "trace_signal_events";

#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHTraceSignalEvent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// Nanoseconds; the partition key, so it MUST be the trace's start.
    pub trace_start_time: i64,
    #[serde(with = "clickhouse::serde::uuid")]
    pub event_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    pub signal_name: String,
    pub severity: u8,
    /// Nanoseconds.
    pub event_timestamp: i64,
    pub summary: String,
    /// Nil until the clusterer assigns the event to a cluster.
    #[serde(with = "clickhouse::serde::uuid")]
    pub cluster_id: Uuid,
}

impl CHTraceSignalEvent {
    /// Placeholder rows written at event creation: one per summary (or a
    /// single empty-summary row), all with a nil `cluster_id`.
    pub fn placeholders(event: &CHSignalEvent) -> Vec<Self> {
        let summaries: Vec<&str> = if event.summaries.is_empty() {
            vec![""]
        } else {
            event.summaries.iter().map(String::as_str).collect()
        };
        summaries
            .into_iter()
            .map(|summary| Self {
                project_id: event.project_id,
                trace_id: event.trace_id,
                trace_start_time: event.trace_start_time,
                event_id: event.id,
                signal_id: event.signal_id,
                signal_name: event.name.clone(),
                severity: event.severity,
                event_timestamp: event.timestamp,
                summary: summary.to_string(),
                cluster_id: Uuid::nil(),
            })
            .collect()
    }
}

/// Trace fields denormalized onto `signal_events` / `trace_signal_events`
/// when an event is created.
#[derive(Row, Serialize, Deserialize, Clone, Debug, Default)]
pub struct TraceSignalContext {
    /// Nanoseconds; the trace's start (`min` over `traces_agg` partials).
    pub start_time: i64,
    pub user_id: String,
    pub session_id: String,
    pub top_span_name: String,
}

#[derive(Row, Deserialize)]
struct StaticRow {
    user_id: String,
    session_id: String,
    top_span_name: String,
}

/// `None` when the trace has no `traces_agg` partial yet. The static fields
/// are best-effort (empty when `traces_static` has no row).
pub async fn get_trace_signal_context(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<Option<TraceSignalContext>> {
    let start_time = clickhouse
        .query(
            "SELECT toUnixTimestamp64Nano(min(start_time)) FROM traces_agg
             WHERE project_id = ? AND id = ?
             HAVING count() > 0",
        )
        .bind(project_id)
        .bind(trace_id)
        .fetch_optional::<i64>()
        .await?;
    let Some(start_time) = start_time else {
        return Ok(None);
    };

    let static_row = clickhouse
        .query(
            "SELECT coalesce(user_id, '') AS user_id,
                    coalesce(session_id, '') AS session_id,
                    coalesce(root_span_name, root_span_name_from_path, '') AS top_span_name
             FROM traces_static FINAL
             WHERE project_id = ? AND trace_id = ?
             LIMIT 1",
        )
        .bind(project_id)
        .bind(trace_id)
        .fetch_optional::<StaticRow>()
        .await?;

    let (user_id, session_id, top_span_name) = static_row
        .map(|r| (r.user_id, r.session_id, r.top_span_name))
        .unwrap_or_default();
    Ok(Some(TraceSignalContext {
        start_time,
        user_id,
        session_id,
        top_span_name,
    }))
}

pub async fn insert_trace_signal_events(
    clickhouse: &clickhouse::Client,
    rows: &[CHTraceSignalEvent],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut insert = clickhouse
        .insert::<CHTraceSignalEvent>(TRACE_SIGNAL_EVENTS_TABLE)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to start trace_signal_events insert: {e:?}"))?
        .with_setting("wait_for_async_insert", "0");
    for row in rows {
        insert.write(row).await?;
    }
    insert
        .end()
        .await
        .map_err(|e| anyhow::anyhow!("trace_signal_events insert failed: {e:?}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(summaries: Vec<String>) -> CHSignalEvent {
        CHSignalEvent {
            id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            signal_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            run_id: Uuid::new_v4(),
            name: "sig".to_string(),
            payload: "{}".to_string(),
            timestamp: 42,
            summary: String::new(),
            summaries,
            severity: 2,
            trace_start_time: 7,
            user_id: "u".to_string(),
            session_id: "s".to_string(),
            top_span_name: "root".to_string(),
        }
    }

    #[test]
    fn one_placeholder_per_summary_with_nil_cluster() {
        let e = event(vec!["a".to_string(), "b".to_string()]);
        let rows = CHTraceSignalEvent::placeholders(&e);
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.cluster_id.is_nil()));
        assert!(
            rows.iter()
                .all(|r| r.trace_start_time == 7 && r.event_id == e.id)
        );
        assert_eq!(rows[0].summary, "a");
        assert_eq!(rows[1].summary, "b");
    }

    #[test]
    fn event_without_summaries_still_gets_a_row() {
        let rows = CHTraceSignalEvent::placeholders(&event(vec![]));
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].summary, "");
    }
}
