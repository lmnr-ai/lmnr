use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::batch_worker::message_handler::{BatchMessageHandler, ProcessStateResult};
use crate::mq::MessageQueue;
use crate::worker::HandlerError;

use super::ClusteringMessage;
use super::queue::push_to_clustering_batch_queue;

/// A batch of clustering messages with metadata for interval-based flushing
#[derive(Clone)]
pub struct ClusteringBatch {
    pub messages: Vec<ClusteringMessage>,
    pub last_flush: Instant,
}

impl ClusteringBatch {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            last_flush: Instant::now(),
        }
    }
}

pub struct BatchingConfig {
    pub size: usize,
    pub flush_interval: Duration,
}

pub struct ClusteringEventBatchingHandler {
    queue: Arc<MessageQueue>,
    config: BatchingConfig,
}

impl ClusteringEventBatchingHandler {
    pub fn new(queue: Arc<MessageQueue>, config: BatchingConfig) -> Self {
        Self { queue, config }
    }

    /// Flush a batch to the queue
    async fn flush_batch(
        &self,
        batch: ClusteringBatch,
    ) -> Result<Vec<ClusteringMessage>, (Vec<ClusteringMessage>, HandlerError)> {
        match push_to_clustering_batch_queue(batch.messages.clone(), self.queue.clone()).await {
            Ok(()) => Ok(batch.messages),
            Err(e) => Err((batch.messages, HandlerError::transient(e))),
        }
    }
}

#[async_trait]
impl BatchMessageHandler for ClusteringEventBatchingHandler {
    type Message = ClusteringMessage;

    /// State is a map of project_id and signal_id to a batch of clustering messages
    type State = HashMap<(Uuid, Uuid), ClusteringBatch>;

    /// State check interval is half of the flush interval to ensure we never wait for more than
    /// the flush interval.
    fn state_check_interval(&self) -> Duration {
        self.config.flush_interval / 2
    }

    fn initial_state(&self) -> Self::State {
        HashMap::new()
    }

    /// Add message to the batch
    async fn handle_message(
        &self,
        message: Self::Message,
        state: &mut Self::State,
    ) -> Result<(), HandlerError> {
        log::debug!(
            "\n Adding message to batch: signal_id={}, project_id={}",
            message.signal_event.signal_id,
            message.project_id
        );
        let key = (message.project_id, message.signal_event.signal_id);
        state
            .entry(key)
            .or_insert_with(ClusteringBatch::new)
            .messages
            .push(message);
        Ok(())
    }

    /// Flush batch if it's reached the required size
    async fn process_state_after_message(
        &self,
        message: Self::Message,
        state: &mut Self::State,
    ) -> ProcessStateResult<Self::Message> {
        let key = (message.project_id, message.signal_event.signal_id);
        let batch_len = state.get(&key).map(|b| b.messages.len()).unwrap_or(0);
        log::debug!(
            "\n Signal_id: {}, Batch len={}",
            message.signal_event.signal_id,
            batch_len
        );

        // Check if batch is ready to flush (by size)
        if batch_len >= self.config.size {
            if let Some(batch) = state.remove(&key) {
                return match self.flush_batch(batch).await {
                    Ok(messages) => ProcessStateResult::ack(messages),
                    Err((messages, error)) => {
                        if error.should_requeue() {
                            ProcessStateResult::requeue(messages)
                        } else {
                            ProcessStateResult::reject(messages)
                        }
                    }
                };
            }
        }

        ProcessStateResult::empty()
    }

    /// Flush stale batches if they haven't been flushed for the required interval
    async fn process_state_periodic(
        &self,
        state: &mut Self::State,
    ) -> ProcessStateResult<Self::Message> {
        let now = Instant::now();
        let mut to_ack = Vec::new();
        let mut to_reject = Vec::new();
        let mut to_requeue = Vec::new();

        // Find all stale batches
        let stale_keys: Vec<_> = state
            .iter()
            .filter(|(_, batch)| {
                !batch.messages.is_empty()
                    && now.duration_since(batch.last_flush) >= self.config.flush_interval
            })
            .map(|(key, _)| *key)
            .collect();

        // Flush all stale batches
        for key in stale_keys {
            if let Some(batch) = state.remove(&key) {
                log::debug!(
                    "Flushing stale batch: {} messages, age={:?}",
                    batch.messages.len(),
                    now.duration_since(batch.last_flush)
                );
                match self.flush_batch(batch).await {
                    Ok(messages) => to_ack.extend(messages),
                    Err((messages, error)) => {
                        if error.should_requeue() {
                            to_requeue.extend(messages);
                        } else {
                            to_reject.extend(messages);
                        }
                    }
                }
            }
        }

        ProcessStateResult {
            to_ack,
            to_reject,
            to_requeue,
        }
    }
}
