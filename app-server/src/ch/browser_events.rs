use clickhouse::Row;
use serde::Serialize;
use uuid::Uuid;

use crate::api::v1::browser_sessions::EventBatch;

#[derive(Row, Serialize)]
pub struct BrowserEventCHRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub event_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub session_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub timestamp: i64,
    pub event_type: u8,
    pub data: Vec<u8>,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
}

pub async fn insert_browser_events(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    event_batch: &EventBatch,
) -> Result<(), clickhouse::error::Error> {
    let mut insert = clickhouse
        .insert("browser_session_events")
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
        .with_option("async_insert", "1")
        .with_option("wait_for_async_insert", "1");

    for event in event_batch.events.iter() {
        insert
            .write(&BrowserEventCHRow {
                event_id: Uuid::new_v4(),
                session_id: event_batch.session_id,
                trace_id: event_batch.trace_id,
                timestamp: event.timestamp,
                event_type: event.event_type,
                data: event.data.clone(),
                project_id: project_id,
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
    })
}
