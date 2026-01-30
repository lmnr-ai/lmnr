use backoff::ExponentialBackoffBuilder;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

use crate::batch_worker::BatchWorkerType;
use crate::batch_worker::message_handler::{BatchMessageHandler, ProcessStateResult, UniqueId};
use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};
use crate::worker::{HandlerError, QueueConfig};

/// Queue worker with internal state that processes messages indefinitely and processes state
/// periodically or along with a message.
pub struct BatchQueueWorker<H: BatchMessageHandler> {
    id: Uuid,
    worker_type: BatchWorkerType,
    handler: H,
    queue: Arc<MessageQueue>,
    config: QueueConfig,
    state: H::State,
    ackers: HashMap<String, MessageQueueAcker>,
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

        // Set up periodic state checking interval (use MAX if zero for no checks)
        let check_interval = if self.handler.state_check_interval().is_zero() {
            Duration::MAX
        } else {
            self.handler.state_check_interval()
        };
        let mut interval = tokio::time::interval(check_interval);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        // Process messages and check state periodically
        loop {
            tokio::select! {
                // Message arrived from queue
                Some(delivery) = receiver.receive() => {
                    let delivery = delivery?;

                    // Process single message
                    let acker = delivery.acker();
                    let data = delivery.data();
                    let result = self.process_message(&data).await;

                    let message = match result {
                        Ok(message) => message,
                        Err(handler_error) => {
                            acker.reject(handler_error.should_requeue()).await?;
                            continue;
                        }
                    };

                    // Store message acker before processing
                    self.ackers.insert(message.get_unique_id(), acker);

                    // Process state
                    let result = self.handler
                        .process_state_after_message(message, &mut self.state)
                        .await;

                    self.handle_process_state_result(result).await?;
                }

                // Periodic state check
                _ = interval.tick() => {
                    log::debug!("====== Periodic state check triggered ======");
                    let result = self.handler
                        .process_state_periodic(&mut self.state)
                        .await;
                    self.handle_process_state_result(result).await?;
                }
            }
        }

        #[allow(unreachable_code)]
        Ok(())
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

    /// Process a single message
    async fn process_message(&mut self, data: &[u8]) -> Result<H::Message, HandlerError> {
        let message = serde_json::from_slice::<H::Message>(data).map_err(|e| {
            log::error!(
                "Queue message deserialization failed. Worker type: {:?}. Worker id: {}. Error: {:?}",
                self.worker_type,
                self.id,
                e
            );
            // Malformed message - reject without requeue (it won't deserialize on retry)
            HandlerError::permanent(anyhow::anyhow!("Deserialization failed: {}", e))
        })?;

        // Handle the message
        // On success: returns Ok(()) → caller will ack
        // On error: HandlerError contains requeue decision
        self.handler
            .handle_message(message.clone(), &mut self.state)
            .await
            .map_err(|e| {
                log::error!(
                    "Worker {} ({:?}) handler failed: {}",
                    self.id,
                    self.worker_type,
                    e
                );
                e
            })?;

        Ok(message)
    }

    /// Handle the result of state processing (ack/reject/requeue messages)
    async fn handle_process_state_result(
        &mut self,
        result: ProcessStateResult<H::Message>,
    ) -> anyhow::Result<()> {
        // Ack successful messages
        if !result.to_ack.is_empty() {
            log::debug!(
                "Worker {} ({:?}) acking {} messages",
                self.id,
                self.worker_type,
                result.to_ack.len()
            );
            self.ack_messages(&result.to_ack).await?;
        }

        // Reject permanent failures (no requeue)
        if !result.to_reject.is_empty() {
            log::error!(
                "Worker {} ({:?}) rejecting {} messages (permanent failure)",
                self.id,
                self.worker_type,
                result.to_reject.len()
            );
            self.reject_messages(&result.to_reject, false).await;
        }

        // Requeue transient failures
        if !result.to_requeue.is_empty() {
            log::warn!(
                "Worker {} ({:?}) requeuing {} messages (transient failure)",
                self.id,
                self.worker_type,
                result.to_requeue.len()
            );
            self.reject_messages(&result.to_requeue, true).await;
        }

        Ok(())
    }

    /// Ack messages in parallel
    async fn ack_messages(&mut self, messages: &[H::Message]) -> anyhow::Result<()> {
        let ack_futures: Vec<_> = messages
            .iter()
            .filter_map(|msg| {
                let msg_id = msg.get_unique_id();
                self.ackers
                    .remove(&msg_id)
                    .map(|acker| async move { acker.ack().await })
            })
            .collect();

        futures_util::future::try_join_all(ack_futures).await?;
        Ok(())
    }

    /// Reject messages in parallel
    async fn reject_messages(&mut self, messages: &[H::Message], requeue: bool) {
        let reject_futures: Vec<_> = messages
            .iter()
            .filter_map(|msg| {
                let msg_id = msg.get_unique_id();
                self.ackers.remove(&msg_id).map(|acker| async move {
                    if let Err(e) = acker.reject(requeue).await {
                        log::error!("Failed to reject message {}: {:?}", msg_id, e);
                    }
                })
            })
            .collect();

        futures_util::future::join_all(reject_futures).await;
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

    impl UniqueId for TestMessage {
        fn get_unique_id(&self) -> String {
            self.id.clone()
        }
    }

    /// Mock handler that can be configured to return different results
    struct MockHandler {
        batch_size: usize,
        fail_handle: bool,
    }

    impl MockHandler {
        fn new(batch_size: usize) -> Self {
            Self {
                batch_size,
                fail_handle: false,
            }
        }

        fn with_failing_handle(mut self) -> Self {
            self.fail_handle = true;
            self
        }
    }

    #[async_trait]
    impl BatchMessageHandler for MockHandler {
        type Message = TestMessage;
        type State = Vec<TestMessage>;

        fn state_check_interval(&self) -> Duration {
            Duration::from_secs(60)
        }

        fn initial_state(&self) -> Self::State {
            Vec::new()
        }

        async fn handle_message(
            &self,
            message: Self::Message,
            state: &mut Self::State,
        ) -> Result<(), HandlerError> {
            if self.fail_handle {
                return Err(HandlerError::transient(anyhow::anyhow!("forced failure")));
            }
            state.push(message);
            Ok(())
        }

        async fn process_state_after_message(
            &self,
            _message: Self::Message,
            state: &mut Self::State,
        ) -> ProcessStateResult<Self::Message> {
            if state.len() >= self.batch_size {
                let messages = std::mem::take(state);
                ProcessStateResult::ack(messages)
            } else {
                ProcessStateResult::empty()
            }
        }

        async fn process_state_periodic(
            &self,
            state: &mut Self::State,
        ) -> ProcessStateResult<Self::Message> {
            if state.is_empty() {
                ProcessStateResult::empty()
            } else {
                let messages = std::mem::take(state);
                ProcessStateResult::ack(messages)
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
    async fn test_process_message_deserializes_and_handles() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let msg = TestMessage {
            id: "test-1".to_string(),
            value: 42,
        };
        let data = serde_json::to_vec(&msg).unwrap();

        let result = worker.process_message(&data).await;

        assert!(result.is_ok());
        let returned_msg = result.unwrap();
        assert_eq!(returned_msg.id, "test-1");
        assert_eq!(returned_msg.value, 42);
        assert_eq!(worker.state.len(), 1);
    }

    #[tokio::test]
    async fn test_process_message_rejects_invalid_json() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let result = worker.process_message(b"not valid json").await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(!err.should_requeue()); // permanent error
    }

    #[tokio::test]
    async fn test_process_message_returns_handler_error() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10).with_failing_handle();
        let mut worker = create_worker(handler, queue);

        let msg = TestMessage {
            id: "test-1".to_string(),
            value: 42,
        };
        let data = serde_json::to_vec(&msg).unwrap();

        let result = worker.process_message(&data).await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.should_requeue()); // transient error from mock
    }

    #[tokio::test]
    async fn test_handle_process_state_result_acks_messages() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        // Add some ackers
        let msg1 = TestMessage {
            id: "msg-1".to_string(),
            value: 1,
        };
        let msg2 = TestMessage {
            id: "msg-2".to_string(),
            value: 2,
        };

        worker
            .ackers
            .insert("msg-1".to_string(), MessageQueueAcker::TokioMpscAcker);
        worker
            .ackers
            .insert("msg-2".to_string(), MessageQueueAcker::TokioMpscAcker);

        let result = ProcessStateResult::ack(vec![msg1, msg2]);
        worker.handle_process_state_result(result).await.unwrap();

        // Ackers should be removed after acking
        assert!(worker.ackers.is_empty());
    }

    #[tokio::test]
    async fn test_handle_process_state_result_rejects_messages() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let msg = TestMessage {
            id: "msg-1".to_string(),
            value: 1,
        };
        worker
            .ackers
            .insert("msg-1".to_string(), MessageQueueAcker::TokioMpscAcker);

        let result = ProcessStateResult::reject(vec![msg]);
        worker.handle_process_state_result(result).await.unwrap();

        assert!(worker.ackers.is_empty());
    }

    #[tokio::test]
    async fn test_handle_process_state_result_requeues_messages() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let msg = TestMessage {
            id: "msg-1".to_string(),
            value: 1,
        };
        worker
            .ackers
            .insert("msg-1".to_string(), MessageQueueAcker::TokioMpscAcker);

        let result = ProcessStateResult::requeue(vec![msg]);
        worker.handle_process_state_result(result).await.unwrap();

        assert!(worker.ackers.is_empty());
    }

    #[tokio::test]
    async fn test_handle_process_state_result_handles_mixed() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let mut worker = create_worker(handler, queue);

        let msg1 = TestMessage {
            id: "ack-1".to_string(),
            value: 1,
        };
        let msg2 = TestMessage {
            id: "reject-1".to_string(),
            value: 2,
        };
        let msg3 = TestMessage {
            id: "requeue-1".to_string(),
            value: 3,
        };

        worker
            .ackers
            .insert("ack-1".to_string(), MessageQueueAcker::TokioMpscAcker);
        worker
            .ackers
            .insert("reject-1".to_string(), MessageQueueAcker::TokioMpscAcker);
        worker
            .ackers
            .insert("requeue-1".to_string(), MessageQueueAcker::TokioMpscAcker);

        let result = ProcessStateResult {
            to_ack: vec![msg1],
            to_reject: vec![msg2],
            to_requeue: vec![msg3],
        };
        worker.handle_process_state_result(result).await.unwrap();

        assert!(worker.ackers.is_empty());
    }
}
