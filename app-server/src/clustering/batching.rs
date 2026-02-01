use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::batch_worker::config::BatchingConfig;
use crate::batch_worker::message_handler::{BatchMessageHandler, HandlerResult};
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

    /// Interval is half of the flush interval to ensure batches are checked frequently enough.
    fn interval(&self) -> Duration {
        self.config.flush_interval / 2
    }

    fn initial_state(&self) -> Self::State {
        HashMap::new()
    }

    /// Add message to batch and flush if batch size is reached
    async fn handle_message(
        &self,
        message: Self::Message,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        let key = (message.project_id, message.signal_event.signal_id);

        // Add message to batch
        state
            .entry(key)
            .or_insert_with(ClusteringBatch::new)
            .messages
            .push(message);

        let batch_len = state.get(&key).map(|b| b.messages.len()).unwrap_or(0);
        log::debug!("Batch key={:?}, len={}", key, batch_len);

        // Flush if batch size reached
        if batch_len >= self.config.size {
            if let Some(batch) = state.remove(&key) {
                return match self.flush_batch(batch).await {
                    Ok(messages) => HandlerResult::ack(messages),
                    Err((messages, error)) => {
                        if error.should_requeue() {
                            HandlerResult::requeue(messages)
                        } else {
                            HandlerResult::reject(messages)
                        }
                    }
                };
            }
        }

        HandlerResult::empty()
    }

    /// Flush stale batches if they haven't been flushed for the required interval
    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
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

        HandlerResult {
            to_ack,
            to_reject,
            to_requeue,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ch::signal_events::CHSignalEvent;
    use crate::clustering::queue::{
        EVENT_CLUSTERING_BATCH_EXCHANGE, EVENT_CLUSTERING_BATCH_ROUTING_KEY,
    };
    use crate::mq::tokio_mpsc::TokioMpscQueue;
    use crate::mq::{MessageQueue, MessageQueueTrait};
    use std::time::Duration;
    use uuid::Uuid;

    fn create_test_message(project_id: Uuid, signal_id: Uuid) -> ClusteringMessage {
        ClusteringMessage {
            id: Uuid::new_v4(),
            project_id,
            signal_event: CHSignalEvent {
                id: Uuid::new_v4(),
                project_id,
                signal_id,
                trace_id: Uuid::new_v4(),
                run_id: Uuid::new_v4(),
                name: "test_signal".to_string(),
                payload: "{}".to_string(),
                timestamp: 0,
            },
            value_template: "test".to_string(),
        }
    }

    fn create_test_queue() -> Arc<MessageQueue> {
        let queue = TokioMpscQueue::new();
        queue.register_queue(
            EVENT_CLUSTERING_BATCH_EXCHANGE,
            EVENT_CLUSTERING_BATCH_ROUTING_KEY,
        );
        Arc::new(MessageQueue::TokioMpsc(queue))
    }

    fn create_handler(
        queue: Arc<MessageQueue>,
        batch_size: usize,
    ) -> ClusteringEventBatchingHandler {
        ClusteringEventBatchingHandler::new(
            queue,
            BatchingConfig {
                size: batch_size,
                flush_interval: Duration::from_secs(60),
            },
        )
    }

    #[tokio::test]
    async fn test_handle_message_adds_to_batch() {
        let queue = create_test_queue();
        let handler = create_handler(queue, 10);
        let mut state = handler.initial_state();

        let project_id = Uuid::new_v4();
        let signal_id = Uuid::new_v4();
        let message = create_test_message(project_id, signal_id);

        handler.handle_message(message, &mut state).await;

        let key = (project_id, signal_id);
        assert!(state.contains_key(&key));
        assert_eq!(state.get(&key).unwrap().messages.len(), 1);
    }

    #[tokio::test]
    async fn test_handle_message_groups_by_project_and_signal() {
        let queue = create_test_queue();
        let handler = create_handler(queue, 10);
        let mut state = handler.initial_state();

        let project1 = Uuid::new_v4();
        let project2 = Uuid::new_v4();
        let signal1 = Uuid::new_v4();
        let signal2 = Uuid::new_v4();

        // Add messages to different batches
        handler
            .handle_message(create_test_message(project1, signal1), &mut state)
            .await;
        handler
            .handle_message(create_test_message(project1, signal1), &mut state)
            .await;
        handler
            .handle_message(create_test_message(project1, signal2), &mut state)
            .await;
        handler
            .handle_message(create_test_message(project2, signal1), &mut state)
            .await;

        assert_eq!(state.len(), 3); // 3 different batches
        assert_eq!(state.get(&(project1, signal1)).unwrap().messages.len(), 2);
        assert_eq!(state.get(&(project1, signal2)).unwrap().messages.len(), 1);
        assert_eq!(state.get(&(project2, signal1)).unwrap().messages.len(), 1);
    }

    #[tokio::test]
    async fn test_handle_message_flushes_when_batch_full() {
        let queue = create_test_queue();
        let handler = create_handler(queue.clone(), 3); // batch size = 3
        let mut state = handler.initial_state();

        let project_id = Uuid::new_v4();
        let signal_id = Uuid::new_v4();

        // Add 3 messages (should trigger flush on third)
        for _ in 0..3 {
            let msg = create_test_message(project_id, signal_id);
            handler.handle_message(msg, &mut state).await;
        }

        // Batch should be removed from state after flush
        assert!(!state.contains_key(&(project_id, signal_id)));
    }

    #[tokio::test]
    async fn test_handle_message_returns_ack_on_flush() {
        let queue = create_test_queue();
        // Need a receiver to avoid "no queues exist" error
        let _receiver = queue
            .get_receiver(
                "test",
                EVENT_CLUSTERING_BATCH_EXCHANGE,
                EVENT_CLUSTERING_BATCH_ROUTING_KEY,
            )
            .await
            .unwrap();

        let handler = create_handler(queue.clone(), 2);
        let mut state = handler.initial_state();

        let project_id = Uuid::new_v4();
        let signal_id = Uuid::new_v4();

        // First message - no flush yet
        let msg1 = create_test_message(project_id, signal_id);
        let result1 = handler.handle_message(msg1, &mut state).await;
        assert!(result1.to_ack.is_empty());

        // Second message - triggers flush
        let msg2 = create_test_message(project_id, signal_id);
        let result2 = handler.handle_message(msg2, &mut state).await;

        assert_eq!(result2.to_ack.len(), 2);
        assert!(result2.to_reject.is_empty());
        assert!(result2.to_requeue.is_empty());
    }

    #[tokio::test]
    async fn test_handle_message_returns_empty_when_not_full() {
        let queue = create_test_queue();
        let handler = create_handler(queue, 10);
        let mut state = handler.initial_state();

        let project_id = Uuid::new_v4();
        let signal_id = Uuid::new_v4();
        let msg = create_test_message(project_id, signal_id);

        let result = handler.handle_message(msg, &mut state).await;

        assert!(result.to_ack.is_empty());
        assert!(result.to_reject.is_empty());
        assert!(result.to_requeue.is_empty());
    }

    #[tokio::test]
    async fn test_handle_interval_flushes_stale_batches() {
        let queue = create_test_queue();
        let _receiver = queue
            .get_receiver(
                "test",
                EVENT_CLUSTERING_BATCH_EXCHANGE,
                EVENT_CLUSTERING_BATCH_ROUTING_KEY,
            )
            .await
            .unwrap();

        let handler = ClusteringEventBatchingHandler::new(
            queue,
            BatchingConfig {
                size: 100,                                 // large size so it won't flush by size
                flush_interval: Duration::from_millis(10), // very short interval
            },
        );
        let mut state = handler.initial_state();

        let project_id = Uuid::new_v4();
        let signal_id = Uuid::new_v4();
        let msg = create_test_message(project_id, signal_id);

        handler.handle_message(msg, &mut state).await;

        // Wait for batch to become stale
        tokio::time::sleep(Duration::from_millis(20)).await;

        let result = handler.handle_interval(&mut state).await;

        assert_eq!(result.to_ack.len(), 1);
        assert!(state.is_empty()); // batch removed
    }

    #[tokio::test]
    async fn test_handle_interval_ignores_fresh_batches() {
        let queue = create_test_queue();
        let handler = ClusteringEventBatchingHandler::new(
            queue,
            BatchingConfig {
                size: 100,
                flush_interval: Duration::from_secs(60), // long interval
            },
        );
        let mut state = handler.initial_state();

        let project_id = Uuid::new_v4();
        let signal_id = Uuid::new_v4();
        let msg = create_test_message(project_id, signal_id);

        handler.handle_message(msg, &mut state).await;

        let result = handler.handle_interval(&mut state).await;

        assert!(result.to_ack.is_empty());
        assert_eq!(state.len(), 1); // batch still there
    }

    #[tokio::test]
    async fn test_flush_batch_returns_requeue_on_queue_error() {
        // Create queue but don't register or add receiver - publish will fail
        let queue = Arc::new(MessageQueue::TokioMpsc(TokioMpscQueue::new()));
        let handler = create_handler(queue, 2);

        let batch = ClusteringBatch {
            messages: vec![create_test_message(Uuid::new_v4(), Uuid::new_v4())],
            last_flush: Instant::now(),
        };

        let result = handler.flush_batch(batch).await;

        assert!(result.is_err());
        let (messages, error) = result.unwrap_err();
        assert_eq!(messages.len(), 1);
        assert!(error.should_requeue()); // transient error
    }
}
