use async_trait::async_trait;
use backon::Retryable;
use serde::{Serialize, de::DeserializeOwned};
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use uuid::Uuid;

use crate::mq::{
    MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiver, MessageQueueReceiverTrait,
    MessageQueueTrait,
};
use crate::utils::retry;

const DEFAULT_PREFETCH_COUNT: u16 = 128;

/// Cap on the backoff between worker connect retries. Tunable so operators can
/// slow the retry cadence when the broker is recovering from memory pressure.
static CONNECT_BACKOFF_MAX_INTERVAL: LazyLock<Duration> = LazyLock::new(|| {
    Duration::from_secs(crate::env::workers::CONNECT_BACKOFF_MAX_INTERVAL_SECS.get())
});

/// Message handler trait - implement this to process messages
#[async_trait]
pub trait MessageHandler: Send + Sync + 'static {
    type Message: DeserializeOwned + Send;

    /// Handle a message. On success, message is acked.
    /// On error, behavior depends on the error type:
    /// - `HandlerError`: Uses embedded requeue flag
    /// - Conversion from `anyhow::Error`: Defaults to reject without requeue
    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError>;

    /// Called just before a message is dropped for exceeding its delayed-retry
    /// budget (see [`RetryConfig::max_attempts`]), so a handler can record the
    /// work as permanently failed. The default drops it silently, which is what
    /// the broker's delivery limit did before retries were delayed.
    async fn on_retries_exhausted(&self, _message: Self::Message) {}
}

/// Error type for message handlers with requeue control
#[derive(thiserror::Error, Debug)]
pub enum HandlerError {
    /// Permanent error - message will be rejected without requeue
    /// Anyhow::Error is converted to Permanent by default
    /// Use for: validation errors, missing data, logic errors
    #[error("Permanent error (will not requeue): {0}")]
    Permanent(#[from] anyhow::Error),

    /// Transient error - message will be requeued for retry
    /// Use for: network errors, service unavailable, lock timeouts
    #[error("Transient error (will requeue): {0}")]
    Transient(anyhow::Error),
}

impl HandlerError {
    /// Create a transient error that will requeue the message
    pub fn transient<E: Into<anyhow::Error>>(error: E) -> Self {
        Self::Transient(error.into())
    }

    /// Create a permanent error that will reject without requeue
    pub fn permanent<E: Into<anyhow::Error>>(error: E) -> Self {
        Self::Permanent(error.into())
    }

    /// Check if this error should trigger a requeue
    pub fn should_requeue(&self) -> bool {
        matches!(self, HandlerError::Transient(_))
    }
}

// Note: The #[from] on Permanent means anyhow::Error converts to Permanent by default
// This is the safe default - requires explicit .transient() for retries

/// Where a queue's transient failures go to wait, instead of being redelivered
/// immediately.
///
/// The target is a consumer-less queue whose dead-letter exchange is the origin
/// queue's own exchange: a failed message sits there for `delay_ms`, then the
/// broker hands it back. Every message in one retry queue MUST use the same
/// `delay_ms` — RabbitMQ expires messages only at the head of a queue, so a
/// long-TTL message would hold up shorter ones behind it.
#[derive(Clone, Copy)]
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub struct RetryConfig {
    pub exchange: &'static str,
    pub routing_key: &'static str,
    pub delay_ms: u64,
    /// Delayed retries before the message is dropped. Replaces the quorum
    /// queue's delivery limit, which stops counting once a message is
    /// republished.
    pub max_attempts: u32,
}

/// Queue configuration for a worker
#[derive(Clone)]
pub struct QueueConfig {
    pub queue_name: &'static str,
    pub exchange_name: &'static str,
    pub routing_key: &'static str,
    pub prefetch_count: u16,
    /// `None` redelivers transient failures immediately.
    pub retry: Option<RetryConfig>,
}

impl QueueConfig {
    /// Create a new QueueConfig with prefetch count resolved from environment.
    ///
    /// The prefetch count is determined by looking up an env var based on the queue name:
    /// `{QUEUE_NAME}_PREFETCH_COUNT` (e.g. `OBSERVATIONS_QUEUE_PREFETCH_COUNT`).
    /// Falls back to DEFAULT_PREFETCH_COUNT (128) if not set.
    ///
    /// Note: the env var key is derived from the actual RabbitMQ queue name string
    /// (e.g. `semantic_event_queue` → `SEMANTIC_EVENT_QUEUE_PREFETCH_COUNT`),
    /// which may differ from the Rust constant name.
    pub fn new(
        queue_name: &'static str,
        exchange_name: &'static str,
        routing_key: &'static str,
    ) -> Self {
        let env_key = format!("{}_PREFETCH_COUNT", queue_name.to_uppercase());
        let prefetch_count = crate::env::num_with_default(&env_key, DEFAULT_PREFETCH_COUNT);

        log::info!(
            "Queue '{}' prefetch_count={} (override via {})",
            queue_name,
            prefetch_count,
            env_key,
        );

        Self {
            queue_name,
            exchange_name,
            routing_key,
            prefetch_count,
            retry: None,
        }
    }

    /// Route this queue's transient failures through a delay queue.
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub fn with_retry(mut self, retry: RetryConfig) -> Self {
        self.retry = Some(retry);
        self
    }
}

/// Worker type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum WorkerType {
    SpansIndexer,
    Notifications,
    NotificationDeliveries,
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    Clustering,
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    SignalJobSubmissionBatch,
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    SignalJobPendingBatch,
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    SignalJobRealtime,
    InputExtraction,
    UserTaskRegex,
    Logs,
    Reports,
    Checkpoints,
    StaticPrompt,
    SpVersioning,
    SpRegexExtraction,
}

impl std::fmt::Display for WorkerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkerType::SpansIndexer => write!(f, "spans_indexer"),
            WorkerType::Notifications => write!(f, "notifications"),
            WorkerType::NotificationDeliveries => write!(f, "notification_deliveries"),
            WorkerType::Clustering => write!(f, "clustering"),
            WorkerType::SignalJobSubmissionBatch => {
                write!(f, "signal_job_submission_batch")
            }
            WorkerType::SignalJobPendingBatch => write!(f, "signal_job_pending_batch"),
            WorkerType::SignalJobRealtime => write!(f, "signal_job_realtime"),
            WorkerType::InputExtraction => write!(f, "input_extraction"),
            WorkerType::UserTaskRegex => write!(f, "user_task_regex"),
            WorkerType::Logs => write!(f, "logs"),
            WorkerType::Reports => write!(f, "reports"),
            WorkerType::Checkpoints => write!(f, "checkpoints"),
            WorkerType::StaticPrompt => write!(f, "static_prompt"),
            WorkerType::SpVersioning => write!(f, "sp_versioning"),
            WorkerType::SpRegexExtraction => write!(f, "sp_regex_extraction"),
        }
    }
}

/// What becomes of a delivery whose handler failed transiently.
#[derive(Debug, PartialEq, Eq)]
enum TransientOutcome {
    /// Waiting in the retry queue; the original delivery is finished with.
    Parked,
    /// Handed straight back to the broker, undelayed.
    RequeueNow,
    /// Retry budget spent — discarded.
    Drop,
}

/// Queue worker that processes messages indefinitely
pub struct QueueWorker<H: MessageHandler> {
    id: Uuid,
    worker_type: WorkerType,
    handler: H,
    queue: Arc<MessageQueue>,
    config: QueueConfig,
}

impl<H: MessageHandler> QueueWorker<H> {
    pub fn new(
        worker_type: WorkerType,
        handler: H,
        queue: Arc<MessageQueue>,
        config: QueueConfig,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            worker_type,
            handler,
            queue,
            config,
        }
    }

    pub fn id(&self) -> Uuid {
        self.id
    }

    /// Main processing loop - runs forever with internal retry
    pub async fn process(self: Arc<Self>) {
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

    async fn process_inner(&self) -> anyhow::Result<()> {
        let mut receiver: MessageQueueReceiver = self.connect().await?;

        log::info!(
            "Worker {} ({:?}) connected and ready to process messages",
            self.id,
            self.worker_type
        );

        while let Some(delivery) = receiver.receive().await {
            let delivery = delivery?;

            let acker = delivery.acker();
            let attempt = delivery.retry_attempt();
            let data = delivery.data();
            let result = self.process_message(&data).await;

            match result {
                Ok(()) => acker.ack().await?,
                Err(e) if e.should_requeue() => match self.park_for_retry(&data, attempt).await {
                    TransientOutcome::Parked => acker.ack().await?,
                    TransientOutcome::RequeueNow => acker.reject(true).await?,
                    TransientOutcome::Drop => acker.reject(false).await?,
                },
                Err(_) => acker.reject(false).await?,
            }
        }

        Ok(())
    }

    /// Hold a transiently-failed message in the retry queue instead of having the
    /// broker redeliver it at once, so the dependency that failed gets time to
    /// recover. On a near-empty queue an immediate requeue comes straight back to
    /// the same worker, which burns the whole retry budget in seconds.
    ///
    /// Falls back to an immediate requeue when the queue has no retry target, or
    /// when parking the message fails — some transient causes ARE broker
    /// failures, and the in-memory transport cannot delay at all.
    async fn park_for_retry(&self, data: &[u8], attempt: u32) -> TransientOutcome {
        let Some(retry) = self.config.retry else {
            return TransientOutcome::RequeueNow;
        };

        if attempt >= retry.max_attempts {
            log::error!(
                "Worker {} ({:?}) dropping a message from '{}' after {} delayed retries",
                self.id,
                self.worker_type,
                self.config.queue_name,
                attempt,
            );
            // Deserialization already succeeded once for this message, or it
            // would have failed permanently instead of transiently.
            if let Ok(message) = serde_json::from_slice::<H::Message>(data) {
                self.handler.on_retries_exhausted(message).await;
            }
            return TransientOutcome::Drop;
        }

        match self
            .queue
            .publish_retry(
                data,
                retry.exchange,
                retry.routing_key,
                retry.delay_ms,
                attempt + 1,
            )
            .await
        {
            Ok(()) => TransientOutcome::Parked,
            Err(e) => {
                log::warn!(
                    "Worker {} ({:?}) could not park a failed message for retry, requeueing immediately: {:?}",
                    self.id,
                    self.worker_type,
                    e
                );
                TransientOutcome::RequeueNow
            }
        }
    }

    async fn connect(&self) -> anyhow::Result<MessageQueueReceiver> {
        let backoff = retry::bounded_delay(
            Duration::from_secs(1),
            *CONNECT_BACKOFF_MAX_INTERVAL,
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

    async fn process_message(&self, data: &[u8]) -> Result<(), HandlerError> {
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
        self.handler.handle(message).await.map_err(|e| {
            log::error!(
                "Worker {} ({:?}) handler failed: {}",
                self.id,
                self.worker_type,
                e
            );
            e
        })
    }
}

/// Worker pool - simple spawning and tracking
pub struct WorkerPool {
    queue: Arc<MessageQueue>,
}

impl WorkerPool {
    pub fn new(queue: Arc<MessageQueue>) -> Self {
        Self { queue }
    }

    /// Spawn N workers of a type
    pub fn spawn<H, F>(
        &self,
        worker_type: WorkerType,
        count: usize,
        handler_factory: F,
        config: QueueConfig,
    ) where
        H: MessageHandler,
        F: Fn() -> H + Send + Sync + 'static,
    {
        for i in 0..count {
            let handler = handler_factory();
            let worker = Arc::new(QueueWorker::new(
                worker_type,
                handler,
                self.queue.clone(),
                config.clone(),
            ));

            let worker_id = worker.id();

            log::info!(
                "Spawning worker {} ({:?}) instance {}",
                worker_id,
                worker_type,
                i
            );

            // Spawn and forget - it runs forever
            tokio::spawn(async move {
                worker.process().await;
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mq::tokio_mpsc::TokioMpscQueue;
    use serde::Deserialize;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const TEST_QUEUE: &str = "test_queue";
    const TEST_EXCHANGE: &str = "test_exchange";
    const TEST_ROUTING_KEY: &str = "test_routing_key";
    const TEST_RETRY_EXCHANGE: &str = "test_retry_exchange";
    const TEST_RETRY_ROUTING_KEY: &str = "test_retry_routing_key";

    #[derive(Serialize, Deserialize)]
    struct TestMessage {
        id: u32,
    }

    #[derive(Default)]
    struct CountingHandler {
        written_off: AtomicUsize,
    }

    #[async_trait]
    impl MessageHandler for CountingHandler {
        type Message = TestMessage;

        async fn handle(&self, _message: Self::Message) -> Result<(), HandlerError> {
            Err(HandlerError::transient(anyhow::anyhow!("dependency down")))
        }

        async fn on_retries_exhausted(&self, _message: Self::Message) {
            self.written_off.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn worker(retry: Option<RetryConfig>) -> QueueWorker<CountingHandler> {
        let config = QueueConfig::new(TEST_QUEUE, TEST_EXCHANGE, TEST_ROUTING_KEY);
        let config = match retry {
            Some(retry) => config.with_retry(retry),
            None => config,
        };

        QueueWorker::new(
            WorkerType::Logs,
            CountingHandler::default(),
            Arc::new(MessageQueue::TokioMpsc(TokioMpscQueue::new())),
            config,
        )
    }

    fn retry_config(max_attempts: u32) -> RetryConfig {
        RetryConfig {
            exchange: TEST_RETRY_EXCHANGE,
            routing_key: TEST_RETRY_ROUTING_KEY,
            delay_ms: 30_000,
            max_attempts,
        }
    }

    fn payload() -> Vec<u8> {
        serde_json::to_vec(&TestMessage { id: 1 }).unwrap()
    }

    #[tokio::test]
    async fn a_queue_without_a_retry_target_requeues_immediately() {
        let worker = worker(None);

        assert_eq!(
            worker.park_for_retry(&payload(), 0).await,
            TransientOutcome::RequeueNow
        );
        assert_eq!(worker.handler.written_off.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn a_transport_that_cannot_delay_requeues_immediately() {
        // The in-memory transport has no TTL and no dead-lettering, so parking
        // must degrade to the pre-existing behavior rather than lose the message.
        let worker = worker(Some(retry_config(40)));

        assert_eq!(
            worker.park_for_retry(&payload(), 0).await,
            TransientOutcome::RequeueNow
        );
        assert_eq!(worker.handler.written_off.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn a_message_at_its_attempt_cap_is_dropped_and_written_off() {
        let worker = worker(Some(retry_config(3)));

        assert_eq!(
            worker.park_for_retry(&payload(), 3).await,
            TransientOutcome::Drop
        );
        assert_eq!(worker.handler.written_off.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn the_cap_is_only_reached_by_a_message_that_carries_the_attempt_count() {
        // A message one short of the cap still gets an attempt. It requeues here
        // only because the in-memory transport can't park it; what matters is
        // that the handler is not asked to write the run off.
        let worker = worker(Some(retry_config(3)));

        assert_eq!(
            worker.park_for_retry(&payload(), 2).await,
            TransientOutcome::RequeueNow
        );
        assert_eq!(worker.handler.written_off.load(Ordering::Relaxed), 0);
    }
}
