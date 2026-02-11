use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;

use super::processor::process_span_messages;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    batch_worker::{
        config::BatchingConfig,
        message_handler::{BatchMessageHandler, HandlerResult, MessageDelivery},
    },
    cache::Cache,
    ch::cloud::CloudClickhouse,
    db::DB,
    mq::MessageQueue,
    pubsub::PubSub,
    storage::StorageService,
    worker::HandlerError,
};

/// Handler for span processing with batch accumulation for cloud deployments.
///
/// Accumulates span messages from multiple queue deliveries and flushes them
/// together when the batch size threshold is reached or the flush interval fires.
pub struct SpanHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client, // TODO: remove once all writes are implemented
    pub ch: CloudClickhouse,
    pub storage: Arc<StorageService>,
    pub pubsub: Arc<PubSub>,
    pub config: BatchingConfig,
}

#[async_trait]
impl BatchMessageHandler for SpanHandler {
    type Message = Vec<RabbitMqSpanMessage>;
    type State = Vec<MessageDelivery<Vec<RabbitMqSpanMessage>>>;

    fn interval(&self) -> Duration {
        self.config.flush_interval
    }

    fn initial_state(&self) -> Self::State {
        Vec::new()
    }

    async fn handle_message(
        &self,
        delivery: MessageDelivery<Self::Message>,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        // Skip empty batches
        if delivery.message.is_empty() {
            return HandlerResult::ack(vec![delivery]);
        }

        // Add delivery to the batch
        state.push(delivery);

        // Check if we've reached the batch size threshold (count total spans across deliveries)
        let total_spans: usize = state.iter().map(|d| d.message.len()).sum();
        log::debug!(
            "Spans batch size: {}, total spans accumulated: {}",
            self.config.size,
            total_spans
        );

        if total_spans >= self.config.size {
            return self.flush_batch(state).await;
        }

        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        if !state.is_empty() {
            return self.flush_batch(state).await;
        }

        HandlerResult::empty()
    }
}

impl SpanHandler {
    /// Flushes accumulated deliveries: processes all spans and inserts them into ClickHouse.
    /// Returns a HandlerResult with all deliveries to ack on success, or requeue/reject on failure.
    async fn flush_batch(
        &self,
        state: &mut Vec<MessageDelivery<Vec<RabbitMqSpanMessage>>>,
    ) -> HandlerResult<Vec<RabbitMqSpanMessage>> {
        log::debug!("Flushing spans batch");

        // Take ownership of deliveries and reset state
        let deliveries_to_flush = std::mem::take(state);

        match self.flush_batch_inner(&deliveries_to_flush).await {
            Ok(()) => HandlerResult::ack(deliveries_to_flush),
            Err(HandlerError::Transient(_)) => HandlerResult::requeue(deliveries_to_flush),
            Err(HandlerError::Permanent(_)) => HandlerResult::reject(deliveries_to_flush),
        }
    }

    async fn flush_batch_inner(
        &self,
        deliveries_to_flush: &[MessageDelivery<Vec<RabbitMqSpanMessage>>],
    ) -> Result<(), HandlerError> {
        // Flatten all deliveries into a single list of span messages
        let messages: Vec<RabbitMqSpanMessage> = deliveries_to_flush
            .iter()
            .flat_map(|delivery| delivery.message.iter().cloned())
            .collect();

        if messages.is_empty() {
            return Ok(());
        }

        process_span_messages(
            messages,
            self.db.clone(),
            self.clickhouse.clone(),
            self.cache.clone(),
            self.storage.clone(),
            self.queue.clone(),
            self.pubsub.clone(),
            self.ch.clone(),
            None,
        )
        .await
    }
}
