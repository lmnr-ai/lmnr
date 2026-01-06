use clickhouse::Row;
use serde::Serialize;
use uuid::Uuid;

use crate::api::v1::browser_sessions::EventBatch;

#[derive(Row, Serialize)]
pub struct BrowserEventCHRow<'a> {
    #[serde(with = "clickhouse::serde::uuid")]
    pub event_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub session_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    // This column is DateTime64(3, 'UTC'), we assume that the timestamp is in milliseconds
    pub timestamp: u64,
    pub event_type: u8,
    pub data: &'a [u8],
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(default)]
    pub size_bytes: u64,
}

pub async fn insert_browser_events(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    event_batch: &EventBatch,
) -> Result<usize, clickhouse::error::Error> {
    let mut insert = clickhouse
        .insert::<BrowserEventCHRow>("browser_session_events")
        .await
        .map_err(|e| {
            // From external POV this should be a permanent error,
            // but looking at the code it seems like `insert` always returns `Ok`,
            // so it doesn't matter.
            log::error!(
                "Error trying to create insert on table browser_session_events: {:?}",
                e
            );
            e
        })?
        .with_option("async_insert", "1");

    let mut total_bytes = 0;
    for event in event_batch.events.iter() {
        let size_bytes = event.estimate_size_bytes();
        total_bytes += size_bytes;
        insert
            .write(&BrowserEventCHRow {
                event_id: Uuid::new_v4(),
                session_id: event_batch.session_id,
                trace_id: event_batch.trace_id,
                timestamp: event.timestamp.abs() as u64,
                event_type: event.event_type,
                data: &event.data,
                project_id: project_id,
                size_bytes: size_bytes as u64,
            })
            .await
            .map_err(|e| {
                log::error!(
                    "Failed attempt to insert browser events (insert.write). Error: {:?}",
                    e
                );
                e
            })?;
    }

    insert.end().await.map_err(|e| {
        log::error!(
            "Failed attempt to insert browser events (insert.end). Error: {:?}",
            e
        );
        e
    })?;

    Ok(total_bytes)
}
