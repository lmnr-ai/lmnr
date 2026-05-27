use std::sync::Arc;

use crate::{
    mq::{
        MessageQueue,
        outbox::{Outbox, OutboxConfig},
    },
    quickwit::{IndexerQueuePayload, SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_ROUTING_KEY},
};

/// Outbox for Quickwit indexer payloads. Indexer data is reproducible from
/// ClickHouse, so drop-on-overflow is the correct failure mode and shields
/// the consumer hot path from broker flow control. Tunable via
/// `INDEXER_OUTBOX_CAPACITY` and `INDEXER_OUTBOX_SHIPPERS`.
pub type IndexerOutbox = Outbox<IndexerQueuePayload>;

pub fn spawn_indexer_outbox(queue: Arc<MessageQueue>) -> Arc<IndexerOutbox> {
    Outbox::spawn(
        queue,
        OutboxConfig {
            name: "indexer",
            exchange: SPANS_INDEXER_EXCHANGE,
            routing_key: SPANS_INDEXER_ROUTING_KEY,
            default_capacity: 2048,
            default_shipper_concurrency: 4,
        },
    )
}
