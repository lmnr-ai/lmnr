use std::sync::Arc;

use anyhow::{Context, anyhow};
use serde_json;

use crate::{
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    quickwit::{IndexerQueuePayload, SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_ROUTING_KEY},
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
