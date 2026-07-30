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

    // Indexer payloads are derivable from ClickHouse, so a tight-budget
    // publish that fails fast under broker memory pressure is safer than the
    // long primary-publish retry that would block the consumer pipeline.
    queue
        .publish_best_effort(
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
/// `payload` is shipped as a Quickwit `json` field, so per-subfield position
/// streams + type inference take care of what the old flatten allow-list
/// did (numbers stay numeric, keys stay metadata, phrase queries can't span
/// fields). No schema knowledge needed at index time.
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
        .map(QuickwitIndexedSignalEvent::from_event)
        .collect();
    let payload = IndexerQueuePayload::SignalEvents(indexed);
    publish_for_indexing(&payload, queue).await
}
