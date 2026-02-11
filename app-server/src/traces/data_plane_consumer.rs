use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

use super::processor::process_span_messages;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    batch_worker::{
        config::BatchingConfig,
        message_handler::{BatchMessageHandler, HandlerResult, MessageDelivery},
    },
    cache::Cache,
    ch::data_plane::DataPlaneClickhouse,
    data_plane::get_workspace_deployment,
    db::DB,
    mq::MessageQueue,
    pubsub::PubSub,
    storage::StorageService,
    worker::HandlerError,
};

/// Handler for span processing with batch accumulation for data plane deployments.
///
/// Accumulates span messages from multiple queue deliveries by project id and flushes them
/// together when the batch size threshold is reached or the flush interval fires.
pub struct DataPlaneSpanHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client, // TODO: remove once all writes are implemented
    pub ch: DataPlaneClickhouse,
    pub storage: Arc<StorageService>,
    pub pubsub: Arc<PubSub>,
    pub config: BatchingConfig,
}

#[async_trait]
impl BatchMessageHandler for DataPlaneSpanHandler {
    type Message = Vec<RabbitMqSpanMessage>;
    type State = HashMap<Uuid, Vec<MessageDelivery<Vec<RabbitMqSpanMessage>>>>;

    fn interval(&self) -> Duration {
        self.config.flush_interval
    }

    fn initial_state(&self) -> Self::State {
        HashMap::new()
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

        let project_id = delivery.message[0].span.project_id;

        // Add delivery to the project's batch
        state
            .entry(project_id)
            .or_insert_with(Vec::new)
            .push(delivery);

        // Check if this project's batch has reached the size threshold
        let project_spans: usize = state
            .get(&project_id)
            .map(|deliveries| deliveries.iter().map(|d| d.message.len()).sum())
            .unwrap_or(0);
        log::debug!(
            "Spans batch size: {}, project {} spans accumulated: {}",
            self.config.size,
            project_id,
            project_spans
        );

        if project_spans >= self.config.size {
            let deliveries = state.remove(&project_id).unwrap_or_default();
            return self.flush_batch(deliveries, project_id).await;
        }

        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        if state.is_empty() {
            return HandlerResult::empty();
        }

        let mut to_ack = Vec::new();
        let mut to_reject = Vec::new();
        let mut to_requeue = Vec::new();

        let project_ids: Vec<Uuid> = state.keys().copied().collect();
        for project_id in project_ids {
            if let Some(batch) = state.remove(&project_id) {
                let result = self.flush_batch(batch, project_id).await;
                to_ack.extend(result.to_ack);
                to_requeue.extend(result.to_requeue);
                to_reject.extend(result.to_reject);
            }
        }

        HandlerResult {
            to_ack,
            to_reject,
            to_requeue,
        }
    }
}

impl DataPlaneSpanHandler {
    /// Flushes a batch of deliveries, processing all spans.
    async fn flush_batch(
        &self,
        batch: Vec<MessageDelivery<Vec<RabbitMqSpanMessage>>>,
        project_id: Uuid,
    ) -> HandlerResult<Vec<RabbitMqSpanMessage>> {
        log::debug!("Flushing spans batch");

        match self.flush_batch_inner(&batch, project_id).await {
            Ok(()) => HandlerResult::ack(batch),
            Err(HandlerError::Transient(_)) => HandlerResult::requeue(batch),
            Err(HandlerError::Permanent(_)) => HandlerResult::reject(batch),
        }
    }

    async fn flush_batch_inner(
        &self,
        deliveries_to_flush: &[MessageDelivery<Vec<RabbitMqSpanMessage>>],
        project_id: Uuid,
    ) -> Result<(), HandlerError> {
        // Flatten all deliveries into a single list of span messages
        let messages: Vec<RabbitMqSpanMessage> = deliveries_to_flush
            .iter()
            .flat_map(|delivery| delivery.message.iter().cloned())
            .collect();

        if messages.is_empty() {
            return Ok(());
        }

        let config =
            get_workspace_deployment(&self.db.pool, self.cache.clone(), project_id)
                .await
                .map_err(HandlerError::transient)?;

        process_span_messages(
            messages,
            self.db.clone(),
            self.clickhouse.clone(),
            self.cache.clone(),
            self.storage.clone(),
            self.queue.clone(),
            self.pubsub.clone(),
            self.ch.clone(),
            Some(&config),
        )
        .await
    }
}
