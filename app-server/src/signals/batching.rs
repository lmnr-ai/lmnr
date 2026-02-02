use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use async_trait::async_trait;

use crate::batch_worker::message_handler::{BatchMessageHandler, HandlerResult};
use crate::batch_worker::{config::BatchingConfig, message_handler::MessageDelivery};
use crate::mq::MessageQueue;
use crate::signals::queue::{
    SignalJobSubmissionBatchMessage, SignalMessage, push_to_submissions_queue,
};
use crate::worker::HandlerError;

#[derive(Clone)]
pub struct SignalBatch {
    /// All messages in this batch (may contain different projects/signals)
    messages: Vec<MessageDelivery<SignalMessage>>,
    last_flush: Instant,
}

impl SignalBatch {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            last_flush: Instant::now(),
        }
    }
}

pub struct SignalBatchingHandler {
    queue: Arc<MessageQueue>,
    config: BatchingConfig,
}

impl SignalBatchingHandler {
    pub fn new(queue: Arc<MessageQueue>, config: BatchingConfig) -> Self {
        Self { queue, config }
    }

    /// Process signal identification
    async fn flush_batch(
        &self,
        batch: SignalBatch,
    ) -> Result<
        Vec<MessageDelivery<SignalMessage>>,
        (Vec<MessageDelivery<SignalMessage>>, HandlerError),
    > {
        let deliveries = batch.messages;

        if deliveries.is_empty() {
            return Ok(deliveries);
        }

        match push_to_submissions_queue(
            SignalJobSubmissionBatchMessage {
                messages: deliveries.iter().map(|d| d.message.clone()).collect(),
            },
            self.queue.clone(),
        )
        .await
        {
            Ok(()) => Ok(deliveries),
            Err(e) => {
                log::warn!("Failed to push batch to submissions queue: {:?}", e);
                Err((deliveries, HandlerError::transient(e)))
            }
        }
    }

    async fn flush_and_handle(&self, batch: SignalBatch) -> HandlerResult<SignalMessage> {
        match self.flush_batch(batch).await {
            Ok(deliveries) => HandlerResult::ack(deliveries),
            Err((deliveries, error)) => {
                if error.should_requeue() {
                    HandlerResult::requeue(deliveries)
                } else {
                    HandlerResult::reject(deliveries)
                }
            }
        }
    }
}

#[async_trait]
impl BatchMessageHandler for SignalBatchingHandler {
    type Message = SignalMessage;
    type State = SignalBatch;

    /// Interval is half of the flush interval to ensure batches are checked frequently enough.
    fn interval(&self) -> Duration {
        self.config.flush_interval / 2
    }

    fn initial_state(&self) -> Self::State {
        SignalBatch::new()
    }

    async fn handle_message(
        &self,
        delivery: MessageDelivery<Self::Message>,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        // Add message to the single batch
        state.messages.push(delivery.clone());

        let batch_len = state.messages.len();

        // Flush if batch size reached
        if batch_len >= self.config.size {
            // Take the batch and replace with new one
            let batch = std::mem::replace(state, SignalBatch::new());
            return self.flush_and_handle(batch).await;
        }

        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        let now = Instant::now();

        // Check if batch is stale and non-empty
        if !state.messages.is_empty()
            && now.duration_since(state.last_flush) >= self.config.flush_interval
        {
            // Take the batch and replace with new one
            let batch = std::mem::replace(state, SignalBatch::new());
            return self.flush_and_handle(batch).await;
        }

        HandlerResult::empty()
    }
}
