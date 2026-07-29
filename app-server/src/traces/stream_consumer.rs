//! Stream-transport span consumer (LAM-2024).
//!
//! Identical processing to `consumer::SpanHandler` — same `process_span_messages`
//! — with the batching/ack machinery replaced by the stream reader's
//! accumulate-then-store-offset loop. Both consumers run side by side during the
//! transition: the quorum queue drains while streams take new traffic.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;

use super::processor::process_span_messages;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    batch_worker::config::BatchingConfig,
    cache::Cache,
    ch::cloud::CloudClickhouse,
    db::DB,
    mq::{
        MessageQueue,
        stream::{StreamBatchHandler, StreamPublisher},
    },
    pii_redactor::PiiRedactorClient,
    pubsub::PubSub,
    worker::HandlerError,
};

pub struct StreamSpanHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub ch: CloudClickhouse,
    pub pubsub: Arc<PubSub>,
    pub pii_redactor: Option<PiiRedactorClient>,
    pub indexer_stream_publisher: Option<Arc<StreamPublisher>>,
    pub config: BatchingConfig,
}

#[async_trait]
impl StreamBatchHandler for StreamSpanHandler {
    /// One record carries the same `Vec<RabbitMqSpanMessage>` the queue path
    /// publishes, so the wire format is shared and a message can be replayed
    /// through either transport.
    type Message = Vec<RabbitMqSpanMessage>;

    fn interval(&self) -> Duration {
        self.config.flush_interval
    }

    fn batch_size(&self) -> usize {
        self.config.size
    }

    /// `SPANS_BATCH_SIZE` is a SPAN count, and one record is a whole export
    /// batch — weigh by span count so the threshold matches `SpanHandler`'s
    /// `sum(message.len())` instead of flushing ~N× more spans per insert.
    fn message_weight(message: &Self::Message) -> usize {
        message.len()
    }

    async fn flush(&self, messages: &[Self::Message]) -> Result<(), HandlerError> {
        let spans: Vec<RabbitMqSpanMessage> = messages.iter().flatten().cloned().collect();

        if spans.is_empty() {
            return Ok(());
        }

        process_span_messages(
            spans,
            self.db.clone(),
            self.clickhouse.clone(),
            self.cache.clone(),
            self.queue.clone(),
            self.pubsub.clone(),
            self.ch.clone(),
            self.pii_redactor.clone(),
            None,
            self.indexer_stream_publisher.clone(),
        )
        .await
    }
}
