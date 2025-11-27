use std::sync::Arc;

use anyhow::{Context, anyhow};
use serde_json;

use crate::{
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    quickwit::{
        IndexerQueueMessage, IndexerQueuePayload, QuickwitIndexedEvent, QuickwitIndexedSpan,
        SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_ROUTING_KEY,
    },
};

pub async fn publish_spans_for_indexing(
    spans: &[QuickwitIndexedSpan],
    events: &[QuickwitIndexedEvent],
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    if spans.is_empty() {
        return Ok(());
    }

    let payload = IndexerQueueMessage {
        spans: spans.to_vec(),
        events: events.to_vec(),
    };

    let payload = serde_json::to_vec(&IndexerQueuePayload::IndexerQueueMessage(payload))
        .context("Failed to serialize spans for Quickwit indexing")?;
    let payload_size = payload.len();

    let max_payload = mq_max_payload();
    if payload_size >= max_payload {
        return Err(anyhow!(
            "Quickwit indexing payload ({} bytes) exceeds MQ limit ({})",
            payload_size,
            max_payload
        ));
    }

    queue
        .publish(&payload, SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_ROUTING_KEY)
        .await
        .context("Failed to publish spans to Quickwit indexer queue")?;

    Ok(())
}
