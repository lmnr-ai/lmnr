use clickhouse::Row;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Row, Serialize)]
pub struct BrowserEventCHRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub event_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub session_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    // This column is DateTime64(3, 'UTC'), we assume that the timestamp is in milliseconds
    pub timestamp: u64,
    pub event_type: u8,
    pub data: Vec<u8>,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub size_bytes: u64,
}

impl BrowserEventCHRow {
    pub fn new(
        session_id: Uuid,
        trace_id: Uuid,
        timestamp: u64,
        event_type: u8,
        data: Vec<u8>,
        project_id: Uuid,
    ) -> Self {
        // 1 byte for event_type, 8 bytes for timestamp + data length
        let size_bytes = (9 + data.len()) as u64;
        Self {
            event_id: Uuid::new_v4(),
            session_id,
            trace_id,
            timestamp,
            event_type,
            data,
            project_id,
            size_bytes,
        }
    }

    pub fn size_bytes(&self) -> usize {
        self.size_bytes as usize
    }
}

pub async fn insert_browser_events(
    clickhouse: &clickhouse::Client,
    events: &[BrowserEventCHRow],
    wait_for_async_insert: bool,
) -> Result<(), clickhouse::error::Error> {
    let mut insert = clickhouse
        .insert::<BrowserEventCHRow>("browser_session_events")
        .await
        .map_err(|e| {
            log::error!(
                "Error trying to create insert on table browser_session_events: {:?}",
                e
            );
            e
        })?
        .with_option("async_insert", "1")
        .with_option(
            "wait_for_async_insert",
            if wait_for_async_insert { "1" } else { "0" },
        );

    for event in events {
        insert.write(event).await.map_err(|e| {
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
