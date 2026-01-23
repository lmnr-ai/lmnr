use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use serde::{Serialize, de::DeserializeOwned};
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

use crate::mq::{
    MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiver, MessageQueueReceiverTrait,
    MessageQueueTrait,
};

/// Message handler trait - implement this to process messages
#[async_trait]
pub trait MessageHandler: Send + Sync + 'static {
    type Message: DeserializeOwned + Send;

    /// Handle a message. On success, message is acked.
    /// On error, behavior depends on the error type:
    /// - `HandlerError`: Uses embedded requeue flag
    /// - Conversion from `anyhow::Error`: Defaults to reject without requeue
    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError>;
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

/// Queue configuration for a worker
#[derive(Clone)]
pub struct QueueConfig {
    pub queue_name: &'static str,
    pub exchange_name: &'static str,
    pub routing_key: &'static str,
}

/// Worker type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum WorkerType {
    Spans,
    SpansIndexer,
    BrowserEvents,
    Evaluators,
    Payloads,
    Signals,
    Notifications,
    Clustering,
    LLMBatchSubmissions,
    LLMBatchPending,
}

impl std::fmt::Display for WorkerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkerType::Spans => write!(f, "spans"),
            WorkerType::SpansIndexer => write!(f, "spans_indexer"),
            WorkerType::BrowserEvents => write!(f, "browser_events"),
            WorkerType::Evaluators => write!(f, "evaluators"),
            WorkerType::Payloads => write!(f, "payloads"),
            WorkerType::Signals => write!(f, "semantic_events"),
            WorkerType::Notifications => write!(f, "notifications"),
            WorkerType::Clustering => write!(f, "clustering"),
            WorkerType::LLMBatchSubmissions => write!(f, "trace_analysis_llm_batch_submissions"),
            WorkerType::LLMBatchPending => write!(f, "trace_analysis_llm_batch_pending"),
        }
    }
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
            let data = delivery.data();
            let result = self.process_message(&data).await;

            match result {
                Ok(()) => acker.ack().await?,
                Err(handler_error) => acker.reject(handler_error.should_requeue()).await?,
            }
        }

        Ok(())
    }

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
