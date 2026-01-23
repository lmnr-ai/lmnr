use anyhow::Result;
use tracing::instrument;

use crate::{
    ch::{self, events::CHEvent},
    db::events::Event,
};

#[instrument(skip(clickhouse, event_payloads))]
pub async fn record_span_events(
    clickhouse: clickhouse::Client,
    event_payloads: &Vec<Event>,
) -> Result<usize> {
    let ch_events = event_payloads
        .iter()
        .map(|e| CHEvent::from_db_event(e))
        .collect::<Vec<CHEvent>>();
    ch::events::insert_events(clickhouse, ch_events).await
}
