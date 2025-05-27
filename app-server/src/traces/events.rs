use std::sync::Arc;

use anyhow::Result;

use crate::{
    ch::{self, events::CHEvent},
    db::{self, DB, events::Event},
};

pub async fn record_events(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    event_payloads: &Vec<Event>,
) -> Result<()> {
    db::events::insert_events(&db.pool, event_payloads).await?;
    let ch_events = event_payloads
        .iter()
        .map(|e| CHEvent::from_db_event(e))
        .collect::<Vec<CHEvent>>();
    ch::events::insert_events(clickhouse, ch_events).await
}
