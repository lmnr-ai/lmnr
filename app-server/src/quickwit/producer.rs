use std::sync::Arc;

use anyhow::{Context, anyhow};
use serde_json;

use crate::{
    ch::signal_events::CHSignalEvent,
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    quickwit::{
        IndexerQueuePayload, QuickwitIndexedSignalEvent, SPANS_INDEXER_EXCHANGE,
        SPANS_INDEXER_ROUTING_KEY,
    },
};

pub async fn publish_for_indexing(
    payload: &IndexerQueuePayload,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let serialized_payload =
        serde_json::to_vec(payload).context("Failed to serialize payload for Quickwit indexing")?;
    let payload_size = serialized_payload.len();

    let max_payload = mq_max_payload();
    if payload_size >= max_payload {
        return Err(anyhow!(
            "Quickwit indexing payload ({} bytes) exceeds MQ limit ({})",
            payload_size,
            max_payload
        ));
    }

    queue
        .publish(
            &serialized_payload,
            SPANS_INDEXER_EXCHANGE,
            SPANS_INDEXER_ROUTING_KEY,
            None,
        )
        .await
        .context("Failed to publish spans/events to Quickwit indexer queue")?;

    Ok(())
}

/// Publish a batch of signal events to the Quickwit indexer queue.
///
/// Callers should log and swallow errors so signal-event creation is never
/// blocked by indexing failures (matches the span/event indexing posture).
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn publish_signal_events_for_indexing(
    events: &[CHSignalEvent],
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    if events.is_empty() {
        return Ok(());
    }

    let indexed: Vec<QuickwitIndexedSignalEvent> = events
        .iter()
        .map(QuickwitIndexedSignalEvent::from)
        .collect();
    let payload = IndexerQueuePayload::SignalEvents(indexed);
    publish_for_indexing(&payload, queue).await
}
