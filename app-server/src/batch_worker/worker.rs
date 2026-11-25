use backon::Retryable;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::batch_worker::BatchWorkerType;
use crate::batch_worker::message_handler::{BatchMessageHandler, HandlerResult, MessageDelivery};
use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};
use crate::utils::retry;
use crate::worker::{self, HandlerError, QueueConfig, RetryConfig, TransientOutcome};

/// A delivery the handler has taken but not yet settled.
struct HeldDelivery {
    acker: MessageQueueAcker,
    /// The original wire bytes, kept only when the queue has a `RetryConfig`:
    /// a park republishes exactly what arrived, never a re-serialized message.
    data: Option<Vec<u8>>,
    attempt: u32,
    priority: Option<u8>,
}

/// A queue worker that maintains internal state across messages.
///
/// Unlike a simple worker that acks each message immediately, this worker:
/// - Stores messages in handler-defined state before acking
/// - Calls `handle_message` after each message to decide what to ack/reject
/// - Runs periodic `handle_interval` checks for time-based processing
///
/// On reconnection, state is reset and unacked messages are redelivered by the queue.
///
/// On `shutdown` the worker stops receiving but lets an in-flight
/// `handle_message`/`handle_interval` (flush + ack) finish, so a batch that was
/// written is also acked. Held-but-unflushed messages are simply never acked and
/// get redelivered once, to the successor.
pub struct BatchQueueWorker<H: BatchMessageHandler> {
    id: Uuid,
    worker_type: BatchWorkerType,
    handler: H,
    queue: Arc<MessageQueue>,
    config: QueueConfig,
    state: H::State,
    held: HashMap<u64, HeldDelivery>,
    shutdown: CancellationToken,
}

impl<H: BatchMessageHandler> BatchQueueWorker<H> {
    pub fn new(
        worker_type: BatchWorkerType,
        handler: H,
        queue: Arc<MessageQueue>,
        config: QueueConfig,
        shutdown: CancellationToken,
    ) -> Self {
        let initial_state = handler.initial_state();
        Self {
            id: Uuid::new_v4(),
            worker_type,
            handler,
            queue,
            config,
            state: initial_state,
            held: HashMap::new(),
            shutdown,
        }
    }

    pub fn id(&self) -> Uuid {
        self.id
    }

    /// Main processing loop - runs until shutdown with internal retry
    pub async fn process(&mut self) {
        while !self.shutdown.is_cancelled() {
            if let Err(e) = self.process_inner().await {
                log::error!(
                    "Worker {} ({:?}) failed: {:?}, reconnecting...",
                    self.id,
                    self.worker_type,
                    e
                );
            }
            tokio::select! {
                biased;
                _ = self.shutdown.cancelled() => {}
                _ = tokio::time::sleep(Duration::from_secs(1)) => {}
            }
        }
        log::info!("Worker {} ({:?}) stopped", self.id, self.worker_type);
    }

    /// Inner processing loop - connects to the queue and processes messages indefinitely.
    async fn process_inner(&mut self) -> anyhow::Result<()> {
        // Reset state and held deliveries per connection - unacked messages are redelivered
        self.state = self.handler.initial_state();
        self.held.clear();

        let mut receiver: MessageQueueReceiver = tokio::select! {
            _ = self.shutdown.cancelled() => return Ok(()),
            receiver = self.connect() => receiver?,
        };

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
                // Checked first so a busy queue can't starve it. Handler calls run
                // in the arm bodies, outside this select, so an in-flight flush
                // and its acks always complete before we get here.
                biased;

                _ = self.shutdown.cancelled() => return Ok(()),

                // Message arrived from queue
                result = receiver.receive() => {
                    match result {
                        Some(delivery) => {
                            let delivery = delivery?;

                            // Extract delivery metadata
                            let acker = delivery.acker();
                            let delivery_tag = delivery.delivery_tag();
                            let attempt = delivery.retry_attempt();
                            let priority = delivery.priority();
                            let data = delivery.data(); // consumes delivery

                            // Deserialize message
                            let message = match self.deserialize_message(&data) {
                                Ok(message) => message,
                                Err(handler_error) => {
                                    acker.reject(handler_error.should_requeue()).await?;
                                    continue;
                                }
                            };

                            // Hold for later acknowledgment
                            self.held.insert(
                                delivery_tag,
                                HeldDelivery {
                                    acker,
                                    data: self.config.retry.is_some().then_some(data),
                                    attempt,
                                    priority,
                                },
                            );

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
                    log::trace!("====== Interval tick triggered for {} ======", self.worker_type);
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
        let backoff = retry::bounded_delay(
            Duration::from_secs(1),
            Duration::from_secs(5),
            Duration::from_secs(300),
        );

        let queue = self.queue.clone();
        let queue_name = self.config.queue_name;
        let exchange = self.config.exchange_name;
        let routing_key = self.config.routing_key;
        let prefetch_count = self.config.prefetch_count;
        let worker_id = self.id;
        let worker_type = self.worker_type;

        (|| {
            let queue = queue.clone();

            async move {
                queue
                    .get_receiver(queue_name, exchange, routing_key, prefetch_count)
                    .await
            }
        })
        .retry(backoff)
        .notify(|e, _| {
            log::error!(
                "Worker {} ({:?}) failed to connect: {:?}",
                worker_id,
                worker_type,
                e
            )
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
            match self.config.retry {
                Some(retry) => self.park_deliveries(&result.to_requeue, retry).await?,
                None => {
                    log::warn!(
                        "Worker {} ({:?}) requeuing {} deliveries (transient failure)",
                        self.id,
                        self.worker_type,
                        result.to_requeue.len()
                    );
                    self.reject_deliveries(&result.to_requeue, true).await?;
                }
            }
        }

        Ok(())
    }

    /// Park each transiently-failed delivery in the retry queue (`worker::park`).
    /// Decided per delivery: one batch can mix first deliveries with ones that
    /// have already been around the retry queue several times.
    async fn park_deliveries(
        &mut self,
        deliveries: &[MessageDelivery<H::Message>],
        retry: RetryConfig,
    ) -> anyhow::Result<()> {
        let held: Vec<_> = deliveries
            .iter()
            .filter_map(|delivery| {
                self.held
                    .remove(&delivery.delivery_tag)
                    .map(|held| (delivery, held))
            })
            .collect();

        let queue = &self.queue;
        let outcomes = futures_util::future::join_all(held.iter().map(|(_, held)| async move {
            match &held.data {
                Some(data) => worker::park(queue, &retry, data, held.attempt, held.priority).await,
                None => TransientOutcome::RequeueNow,
            }
        }))
        .await;

        let (mut parked, mut requeued, mut dropped) = (0, 0, 0);
        let mut settlements = Vec::with_capacity(held.len());
        for ((delivery, held), outcome) in held.into_iter().zip(outcomes) {
            match outcome {
                TransientOutcome::Parked => parked += 1,
                TransientOutcome::RequeueNow => requeued += 1,
                TransientOutcome::Drop => {
                    dropped += 1;
                    self.handler.on_retries_exhausted(&delivery.message).await;
                }
            }
            settlements.push(async move {
                match outcome {
                    TransientOutcome::Parked => held.acker.ack().await,
                    TransientOutcome::RequeueNow => held.acker.reject(true).await,
                    TransientOutcome::Drop => held.acker.reject(false).await,
                }
            });
        }

        if dropped > 0 {
            log::error!(
                "Worker {} ({:?}) dropping {} deliveries from '{}' after {} delayed retries",
                self.id,
                self.worker_type,
                dropped,
                self.config.queue_name,
                retry.max_attempts,
            );
        }
        log::warn!(
            "Worker {} ({:?}) transient failure on '{}': {} deliveries parked for {}ms, {} requeued immediately, {} dropped",
            self.id,
            self.worker_type,
            self.config.queue_name,
            parked,
            retry.delay_ms,
            requeued,
            dropped,
        );

        futures_util::future::try_join_all(settlements).await?;
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
                self.held
                    .remove(&delivery.delivery_tag)
                    .map(|held| async move { held.acker.ack().await })
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
                self.held
                    .remove(&delivery.delivery_tag)
                    .map(|held| async move { held.acker.reject(requeue).await })
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
    use crate::mq::recording::{RecordedRetry, RecordingQueue, Settlement, SettlementLog};
    use crate::mq::tokio_mpsc::TokioMpscQueue;
    use async_trait::async_trait;
    use serde::{Deserialize, Serialize};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    const TEST_EXCHANGE: &str = "test_exchange";
    const TEST_ROUTING_KEY: &str = "test_routing_key";
    const TEST_QUEUE: &str = "test_queue";
    const TEST_RETRY_EXCHANGE: &str = "test_retry_exchange";
    const TEST_RETRY_ROUTING_KEY: &str = "test_retry_routing_key";

    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct TestMessage {
        id: String,
        value: i32,
    }

    /// Mock handler that can be configured to return different results
    struct MockHandler {
        batch_size: usize,
        exhausted: AtomicUsize,
    }

    impl MockHandler {
        fn new(batch_size: usize) -> Self {
            Self {
                batch_size,
                exhausted: AtomicUsize::new(0),
            }
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

        async fn on_retries_exhausted(&self, _message: &Self::Message) {
            self.exhausted.fetch_add(1, Ordering::Relaxed);
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
            BatchWorkerType::BrowserEvents,
            handler,
            queue,
            QueueConfig::new(TEST_QUEUE, TEST_EXCHANGE, TEST_ROUTING_KEY),
            CancellationToken::new(),
        )
    }

    fn held(acker: MessageQueueAcker) -> HeldDelivery {
        HeldDelivery {
            acker,
            data: None,
            attempt: 0,
            priority: None,
        }
    }

    fn retry_config(max_attempts: u32) -> RetryConfig {
        RetryConfig {
            exchange: TEST_RETRY_EXCHANGE,
            routing_key: TEST_RETRY_ROUTING_KEY,
            delay_ms: 300_000,
            max_attempts,
        }
    }

    fn create_retrying_worker(
        queue: MessageQueue,
        retry: Option<RetryConfig>,
    ) -> BatchQueueWorker<MockHandler> {
        let config = QueueConfig::new(TEST_QUEUE, TEST_EXCHANGE, TEST_ROUTING_KEY);
        BatchQueueWorker::new(
            BatchWorkerType::Spans,
            MockHandler::new(10),
            Arc::new(queue),
            match retry {
                Some(retry) => config.with_retry(retry),
                None => config,
            },
            CancellationToken::new(),
        )
    }

    fn test_message(tag: u64) -> TestMessage {
        TestMessage {
            id: format!("msg-{tag}"),
            value: tag as i32,
        }
    }

    /// Holds a delivery the way the receive loop would, and returns what the
    /// handler hands back for it.
    fn hold(
        worker: &mut BatchQueueWorker<MockHandler>,
        log: &SettlementLog,
        tag: u64,
        attempt: u32,
        priority: Option<u8>,
    ) -> MessageDelivery<TestMessage> {
        let message = test_message(tag);
        worker.held.insert(
            tag,
            HeldDelivery {
                acker: log.acker(tag),
                data: Some(serde_json::to_vec(&message).unwrap()),
                attempt,
                priority,
            },
        );
        MessageDelivery::new(message, tag)
    }

    fn recorded_retries(worker: &BatchQueueWorker<MockHandler>) -> Vec<RecordedRetry> {
        match worker.queue.as_ref() {
            MessageQueue::Recording(queue) => {
                let mut retries = queue.retries();
                retries.sort_by_key(|retry| retry.message.clone());
                retries
            }
            _ => unreachable!("only recording queues record retries"),
        }
    }

    #[tokio::test]
    async fn a_transient_flush_parks_every_delivery_and_acks_it() {
        let log = SettlementLog::default();
        let mut worker =
            create_retrying_worker(RecordingQueue::default().into(), Some(retry_config(12)));
        let deliveries = vec![
            hold(&mut worker, &log, 1, 0, None),
            hold(&mut worker, &log, 2, 5, Some(7)),
        ];

        worker
            .handle_result(HandlerResult::requeue(deliveries))
            .await
            .unwrap();

        assert_eq!(
            log.settlements(),
            vec![(1, Settlement::Ack), (2, Settlement::Ack)]
        );
        assert_eq!(
            recorded_retries(&worker),
            vec![
                RecordedRetry {
                    message: serde_json::to_vec(&test_message(1)).unwrap(),
                    exchange: TEST_RETRY_EXCHANGE.to_string(),
                    routing_key: TEST_RETRY_ROUTING_KEY.to_string(),
                    ttl_ms: 300_000,
                    attempt: 1,
                    priority: None,
                },
                RecordedRetry {
                    message: serde_json::to_vec(&test_message(2)).unwrap(),
                    exchange: TEST_RETRY_EXCHANGE.to_string(),
                    routing_key: TEST_RETRY_ROUTING_KEY.to_string(),
                    ttl_ms: 300_000,
                    attempt: 6,
                    priority: Some(7),
                },
            ]
        );
        assert!(worker.held.is_empty());
    }

    #[tokio::test]
    async fn a_queue_without_a_retry_config_requeues_immediately() {
        let log = SettlementLog::default();
        let mut worker = create_retrying_worker(RecordingQueue::default().into(), None);
        let deliveries = vec![
            hold(&mut worker, &log, 1, 0, None),
            hold(&mut worker, &log, 2, 0, None),
        ];

        worker
            .handle_result(HandlerResult::requeue(deliveries))
            .await
            .unwrap();

        assert_eq!(
            log.settlements(),
            vec![
                (1, Settlement::Reject { requeue: true }),
                (2, Settlement::Reject { requeue: true })
            ]
        );
        assert!(recorded_retries(&worker).is_empty());
    }

    #[tokio::test]
    async fn the_attempt_cap_is_decided_per_delivery() {
        let log = SettlementLog::default();
        let mut worker =
            create_retrying_worker(RecordingQueue::default().into(), Some(retry_config(12)));
        let deliveries = vec![
            hold(&mut worker, &log, 1, 11, None),
            hold(&mut worker, &log, 2, 12, None),
        ];

        worker
            .handle_result(HandlerResult::requeue(deliveries))
            .await
            .unwrap();

        assert_eq!(
            log.settlements(),
            vec![
                (1, Settlement::Ack),
                (2, Settlement::Reject { requeue: false })
            ]
        );
        assert_eq!(recorded_retries(&worker).len(), 1);
        assert_eq!(recorded_retries(&worker)[0].attempt, 12);
        assert_eq!(worker.handler.exhausted.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn a_failed_park_requeues_immediately() {
        let log = SettlementLog::default();
        let mut worker = create_retrying_worker(
            RecordingQueue::failing_retries().into(),
            Some(retry_config(12)),
        );
        let deliveries = vec![hold(&mut worker, &log, 1, 0, None)];

        worker
            .handle_result(HandlerResult::requeue(deliveries))
            .await
            .unwrap();

        assert_eq!(
            log.settlements(),
            vec![(1, Settlement::Reject { requeue: true })]
        );
        assert_eq!(worker.handler.exhausted.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn the_in_memory_queue_falls_back_to_an_immediate_requeue() {
        // LITE mode: the in-memory transport refuses `publish_retry`.
        let log = SettlementLog::default();
        let mut worker = create_retrying_worker(
            MessageQueue::TokioMpsc(TokioMpscQueue::new()),
            Some(retry_config(12)),
        );
        let deliveries = vec![hold(&mut worker, &log, 1, 0, None)];

        worker
            .handle_result(HandlerResult::requeue(deliveries))
            .await
            .unwrap();

        assert_eq!(
            log.settlements(),
            vec![(1, Settlement::Reject { requeue: true })]
        );
    }

    #[tokio::test]
    async fn test_worker_initializes_with_empty_state() {
        let queue = create_test_queue();
        let handler = MockHandler::new(10);
        let worker = create_worker(handler, queue);

        assert!(worker.state.is_empty());
        assert!(worker.held.is_empty());
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

        // Hold some deliveries
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

        worker
            .held
            .insert(1, held(MessageQueueAcker::TokioMpscAcker));
        worker
            .held
            .insert(2, held(MessageQueueAcker::TokioMpscAcker));

        let result = HandlerResult::ack(vec![delivery1, delivery2]);
        worker.handle_result(result).await.unwrap();

        // Both should be released after acking
        assert!(worker.held.is_empty());
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
        worker
            .held
            .insert(1, held(MessageQueueAcker::TokioMpscAcker));

        let result = HandlerResult::reject(vec![delivery]);
        worker.handle_result(result).await.unwrap();

        assert!(worker.held.is_empty());
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
        worker
            .held
            .insert(1, held(MessageQueueAcker::TokioMpscAcker));

        let result = HandlerResult::requeue(vec![delivery]);
        worker.handle_result(result).await.unwrap();

        assert!(worker.held.is_empty());
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

        worker
            .held
            .insert(1, held(MessageQueueAcker::TokioMpscAcker));
        worker
            .held
            .insert(2, held(MessageQueueAcker::TokioMpscAcker));
        worker
            .held
            .insert(3, held(MessageQueueAcker::TokioMpscAcker));

        let result = HandlerResult {
            to_ack: vec![delivery1],
            to_reject: vec![delivery2],
            to_requeue: vec![delivery3],
        };
        worker.handle_result(result).await.unwrap();

        // All should be released
        assert!(worker.held.is_empty());
    }

    /// Flushes every message immediately, but slowly, so shutdown can land mid-flush.
    struct SlowFlushHandler {
        flush_started: Arc<tokio::sync::Notify>,
        flushed: Arc<std::sync::atomic::AtomicUsize>,
    }

    #[async_trait]
    impl BatchMessageHandler for SlowFlushHandler {
        type Message = TestMessage;
        type State = ();

        fn interval(&self) -> Duration {
            Duration::from_secs(60)
        }

        fn initial_state(&self) -> Self::State {}

        async fn handle_message(
            &self,
            delivery: MessageDelivery<Self::Message>,
            _state: &mut Self::State,
        ) -> HandlerResult<Self::Message> {
            self.flush_started.notify_one();
            tokio::time::sleep(Duration::from_millis(200)).await;
            self.flushed
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            HandlerResult::ack(vec![delivery])
        }

        async fn handle_interval(&self, _state: &mut Self::State) -> HandlerResult<Self::Message> {
            HandlerResult::empty()
        }
    }

    /// Shutdown must not cut a flush short (it'd be written but never acked, then
    /// redelivered and written again), and must stop the worker taking new work.
    #[tokio::test]
    async fn shutdown_finishes_the_in_flight_flush_then_stops() {
        let queue = create_test_queue();
        let flush_started = Arc::new(tokio::sync::Notify::new());
        let flushed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let shutdown = CancellationToken::new();
        let mut worker = BatchQueueWorker::new(
            BatchWorkerType::BrowserEvents,
            SlowFlushHandler {
                flush_started: flush_started.clone(),
                flushed: flushed.clone(),
            },
            queue.clone(),
            QueueConfig::new(TEST_QUEUE, TEST_EXCHANGE, TEST_ROUTING_KEY),
            shutdown.clone(),
        );
        let running = tokio::spawn(async move { worker.process().await });

        let message = serde_json::to_vec(&TestMessage {
            id: "msg-1".to_string(),
            value: 1,
        })
        .unwrap();
        // The receiver registers asynchronously; retry until the publish lands.
        while queue
            .publish(&message, TEST_EXCHANGE, TEST_ROUTING_KEY, None)
            .await
            .is_err()
        {
            tokio::task::yield_now().await;
        }
        flush_started.notified().await;

        shutdown.cancel();
        queue
            .publish(&message, TEST_EXCHANGE, TEST_ROUTING_KEY, None)
            .await
            .unwrap();

        tokio::time::timeout(Duration::from_secs(5), running)
            .await
            .expect("worker must stop after shutdown")
            .unwrap();
        assert_eq!(
            flushed.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "the in-flight flush completes; the message sent after shutdown is not taken"
        );
    }
}
