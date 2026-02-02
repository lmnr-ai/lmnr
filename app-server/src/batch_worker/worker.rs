use backoff::ExponentialBackoffBuilder;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

use crate::batch_worker::BatchWorkerType;
use crate::batch_worker::message_handler::{BatchMessageHandler, HandlerResult, MessageDelivery};
use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};
use crate::worker::{HandlerError, QueueConfig};

/// A queue worker that maintains internal state across messages.
///
/// Unlike a simple worker that acks each message immediately, this worker:
/// - Stores messages in handler-defined state before acking
/// - Calls `handle_message` after each message to decide what to ack/reject
/// - Runs periodic `handle_interval` checks for time-based processing
///
/// On reconnection, state is reset and unacked messages are redelivered by the queue.
pub struct BatchQueueWorker<H: BatchMessageHandler> {
    id: Uuid,
    worker_type: BatchWorkerType,
    handler: H,
    queue: Arc<MessageQueue>,
    config: QueueConfig,
    state: H::State,
    ackers: HashMap<u64, MessageQueueAcker>,
}

impl<H: BatchMessageHandler> BatchQueueWorker<H> {
    pub fn new(
        worker_type: BatchWorkerType,
        handler: H,
        queue: Arc<MessageQueue>,
        config: QueueConfig,
    ) -> Self {
        let initial_state = handler.initial_state();
        Self {
            id: Uuid::new_v4(),
            worker_type,
            handler,
            queue,
            config,
            state: initial_state,
            ackers: HashMap::new(),
        }
    }

    pub fn id(&self) -> Uuid {
        self.id
    }

    /// Main processing loop - runs forever with internal retry
    pub async fn process(&mut self) {
        loop {
            if let Err(e) = self.process_inner().await {
                log::error!(
                    "Worker {} ({:?}) failed: {:?}, reconnecting...",
                    self.id,
                    self.worker_type,
                    e
                );
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    /// Inner processing loop - connects to the queue and processes messages indefinitely.
    async fn process_inner(&mut self) -> anyhow::Result<()> {
        // Reset state and ackers on each connection - unacked messages will be redelivered
        self.state = self.handler.initial_state();
        self.ackers.clear();

        let mut receiver: MessageQueueReceiver = self.connect().await?;

        log::info!(
            "Worker {} ({:?}) connected and ready to process messages",
            self.id,
            self.worker_type
        );

        // Set up periodic interval (use MAX if zero to skip interval handling)
        let interval_duration = if self.handler.interval().is_zero() {
            Duration::MAX
        } else {
            self.handler.interval()
        };
        let mut interval = tokio::time::interval(interval_duration);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        // Process messages and handle periodic intervals§
        loop {
            tokio::select! {
                // Message arrived from queue
                result = receiver.receive() => {
                    match result {
                        Some(delivery) => {
                            let delivery = delivery?;

                            // Extract delivery metadata
                            let acker = delivery.acker();
                            let delivery_tag = delivery.delivery_tag();
                            let data = delivery.data(); // consumes delivery

                            // Deserialize message
                            let message = match self.deserialize_message(&data) {
                                Ok(message) => message,
                                Err(handler_error) => {
                                    acker.reject(handler_error.should_requeue()).await?;
                                    continue;
                                }
                            };

                            // Store acker for later acknowledgment
                            self.ackers.insert(delivery_tag, acker);

                            // Wrap message with delivery metadata and handle
                            let message_delivery = MessageDelivery::new(message, delivery_tag);
                            let result = self.handler
                                .handle_message(message_delivery, &mut self.state)
                                .await;

                            self.handle_result(result).await?;
                        }
                        None => {
                            // Stream ended, exit to trigger reconnection
                            return Ok(());
                        }
                    }
                }

                // Interval tick
                _ = interval.tick() => {
                    log::debug!("====== Interval tick triggered for {} ======", self.worker_type);
                    let result = self.handler
                        .handle_interval(&mut self.state)
                        .await;
                    self.handle_result(result).await?;
                }
            }
        }
    }

    /// Connect to the queue
    async fn connect(&self) -> anyhow::Result<MessageQueueReceiver> {
        let backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(Duration::from_secs(1))
            .with_max_interval(Duration::from_secs(60))
            .with_max_elapsed_time(Some(Duration::from_secs(300)))
            .build();

        let queue = self.queue.clone();
        let queue_name = self.config.queue_name;
        let exchange = self.config.exchange_name;
        let routing_key = self.config.routing_key;
        let worker_id = self.id;
        let worker_type = self.worker_type;

        backoff::future::retry(backoff, || {
            let queue = queue.clone();

            async move {
                queue
                    .get_receiver(queue_name, exchange, routing_key)
                    .await
                    .map_err(|e| {
                        log::error!(
                            "Worker {} ({:?}) failed to connect: {:?}",
                            worker_id,
                            worker_type,
                            e
                        );
                        backoff::Error::transient(e)
                    })
            }
        })
        .await
    }

    /// Deserialize a message from raw bytes
    fn deserialize_message(&self, data: &[u8]) -> Result<H::Message, HandlerError> {
        serde_json::from_slice::<H::Message>(data).map_err(|e| {
            log::error!(
                "Queue message deserialization failed. Worker type: {:?}. Worker id: {}. Error: {:?}",
                self.worker_type,
                self.id,
                e
            );
            // Malformed message - reject without requeue (it won't deserialize on retry)
            HandlerError::permanent(anyhow::anyhow!("Deserialization failed: {}", e))
        })
    }

    /// Handle the result from handler (ack/reject/requeue deliveries)
    async fn handle_result(&mut self, result: HandlerResult<H::Message>) -> anyhow::Result<()> {
        // Ack successful deliveries
        if !result.to_ack.is_empty() {
            log::debug!(
                "Worker {} ({:?}) acking {} deliveries",
                self.id,
                self.worker_type,
                result.to_ack.len()
            );
            self.ack_deliveries(&result.to_ack).await?;
        }

        // Reject permanent failures (no requeue)
        if !result.to_reject.is_empty() {
            log::error!(
                "Worker {} ({:?}) rejecting {} deliveries (permanent failure)",
                self.id,
                self.worker_type,
                result.to_reject.len()
            );
            self.reject_deliveries(&result.to_reject, false).await?;
        }

        // Requeue transient failures
        if !result.to_requeue.is_empty() {
            log::warn!(
                "Worker {} ({:?}) requeuing {} deliveries (transient failure)",
                self.id,
                self.worker_type,
                result.to_requeue.len()
            );
            self.reject_deliveries(&result.to_requeue, true).await?;
        }

        Ok(())
    }

    /// Ack deliveries in parallel
    async fn ack_deliveries(
        &mut self,
        deliveries: &[MessageDelivery<H::Message>],
    ) -> anyhow::Result<()> {
        let ack_futures: Vec<_> = deliveries
            .iter()
            .filter_map(|delivery| {
                self.ackers
                    .remove(&delivery.delivery_tag)
                    .map(|acker| async move { acker.ack().await })
            })
            .collect();

        futures_util::future::try_join_all(ack_futures).await?;
        Ok(())
    }

    /// Reject deliveries in parallel
    async fn reject_deliveries(
        &mut self,
        deliveries: &[MessageDelivery<H::Message>],
        requeue: bool,
    ) -> anyhow::Result<()> {
        let reject_futures: Vec<_> = deliveries
            .iter()
            .filter_map(|delivery| {
                self.ackers
                    .remove(&delivery.delivery_tag)
                    .map(|acker| async move { acker.reject(requeue).await })
            })
            .collect();

        futures_util::future::try_join_all(reject_futures).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mq::MessageQueueAcker;
    use crate::mq::tokio_mpsc::TokioMpscQueue;
    use async_trait::async_trait;
    use serde::{Deserialize, Serialize};
    use std::time::Duration;

    const TEST_EXCHANGE: &str = "test_exchange";
    const TEST_ROUTING_KEY: &str = "test_routing_key";
    const TEST_QUEUE: &str = "test_queue";

    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct TestMessage {
        id: String,
        value: i32,
    }

    /// Mock handler that can be configured to return different results
    struct MockHandler {
        batch_size: usize,
    }

    impl MockHandler {
        fn new(batch_size: usize) -> Self {
            Self { batch_size }
        }
    }

    #[async_trait]
    impl BatchMessageHandler for MockHandler {
        type Message = TestMessage;
        type State = Vec<MessageDelivery<TestMessage>>;

        fn interval(&self) -> Duration {
            Duration::from_secs(60)
        }

        fn initial_state(&self) -> Self::State {
            Vec::new()
        }

        async fn handle_message(
            &self,
            delivery: MessageDelivery<Self::Message>,
            state: &mut Self::State,
        ) -> HandlerResult<Self::Message> {
            state.push(delivery);

            if state.len() >= self.batch_size {
                let deliveries = std::mem::take(state);
                HandlerResult::ack(deliveries)
            } else {
                HandlerResult::empty()
            }
        }

        async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
            if state.is_empty() {
                HandlerResult::empty()
            } else {
                let deliveries = std::mem::take(state);
                HandlerResult::ack(deliveries)
            }
        }
    }

    fn create_test_queue() -> Arc<MessageQueue> {
        let queue = TokioMpscQueue::new();
        queue.register_queue(TEST_EXCHANGE, TEST_ROUTING_KEY);
        Arc::new(MessageQueue::TokioMpsc(queue))
    }

    fn create_worker(
        handler: MockHandler,
        queue: Arc<MessageQueue>,
    ) -> BatchQueueWorker<MockHandler> {
        BatchQueueWorker::new(
            BatchWorkerType::ClusteringBatching,
            handler,
            queue,
            QueueConfig {
                queue_name: TEST_QUEUE,
                exchange_name: TEST_EXCHANGE,
                routing_key: TEST_ROUTING_KEY,
            },
        )
    }

    #[tokio::test]
    async fn test_worker_initializes_with_empty_state() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let worker = create_worker(handler, queue);

        assert!(worker.state.is_empty());
        assert!(worker.ackers.is_empty());
    }

    #[tokio::test]
    async fn test_deserialize_message_success() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let worker = create_worker(handler, queue);

        let msg = TestMessage {
            id: "test-1".to_string(),
            value: 42,
        };
        let data = serde_json::to_vec(&msg).unwrap();

        let result = worker.deserialize_message(&data);

        assert!(result.is_ok());
        let returned_msg = result.unwrap();
        assert_eq!(returned_msg.id, "test-1");
        assert_eq!(returned_msg.value, 42);
    }

    #[tokio::test]
    async fn test_deserialize_message_rejects_invalid_json() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let worker = create_worker(handler, queue);

        let result = worker.deserialize_message(b"not valid json");

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(!err.should_requeue()); // permanent error
    }

    #[tokio::test]
    async fn test_handle_message_adds_to_state() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let msg = TestMessage {
            id: "test-1".to_string(),
            value: 42,
        };
        let delivery = MessageDelivery::new(msg, 1);

        let result = worker
            .handler
            .handle_message(delivery, &mut worker.state)
            .await;

        assert!(result.to_ack.is_empty()); // batch not full yet
        assert_eq!(worker.state.len(), 1);
    }

    #[tokio::test]
    async fn test_handle_result_acks_deliveries() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        // Add some ackers
        let delivery1 = MessageDelivery::new(
            TestMessage {
                id: "msg-1".to_string(),
                value: 1,
            },
            1,
        );
        let delivery2 = MessageDelivery::new(
            TestMessage {
                id: "msg-2".to_string(),
                value: 2,
            },
            2,
        );

        worker.ackers.insert(1, MessageQueueAcker::TokioMpscAcker);
        worker.ackers.insert(2, MessageQueueAcker::TokioMpscAcker);

        let result = HandlerResult::ack(vec![delivery1, delivery2]);
        worker.handle_result(result).await.unwrap();

        // Both ackers should be removed after acking
        assert!(worker.ackers.is_empty());
    }

    #[tokio::test]
    async fn test_handle_result_rejects_deliveries() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let delivery = MessageDelivery::new(
            TestMessage {
                id: "msg-1".to_string(),
                value: 1,
            },
            1,
        );
        worker.ackers.insert(1, MessageQueueAcker::TokioMpscAcker);

        let result = HandlerResult::reject(vec![delivery]);
        worker.handle_result(result).await.unwrap();

        assert!(worker.ackers.is_empty());
    }

    #[tokio::test]
    async fn test_handle_result_requeues_deliveries() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let delivery = MessageDelivery::new(
            TestMessage {
                id: "msg-1".to_string(),
                value: 1,
            },
            1,
        );
        worker.ackers.insert(1, MessageQueueAcker::TokioMpscAcker);

        let result = HandlerResult::requeue(vec![delivery]);
        worker.handle_result(result).await.unwrap();

        assert!(worker.ackers.is_empty());
    }

    #[tokio::test]
    async fn test_handle_result_handles_mixed() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let delivery1 = MessageDelivery::new(
            TestMessage {
                id: "ack-1".to_string(),
                value: 1,
            },
            1,
        );
        let delivery2 = MessageDelivery::new(
            TestMessage {
                id: "reject-1".to_string(),
                value: 2,
            },
            2,
        );
        let delivery3 = MessageDelivery::new(
            TestMessage {
                id: "requeue-1".to_string(),
                value: 3,
            },
            3,
        );

        worker.ackers.insert(1, MessageQueueAcker::TokioMpscAcker);
        worker.ackers.insert(2, MessageQueueAcker::TokioMpscAcker);
        worker.ackers.insert(3, MessageQueueAcker::TokioMpscAcker);

        let result = HandlerResult {
            to_ack: vec![delivery1],
            to_reject: vec![delivery2],
            to_requeue: vec![delivery3],
        };
        worker.handle_result(result).await.unwrap();

        // All ackers should be removed
        assert!(worker.ackers.is_empty());
    }
}
