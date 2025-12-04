use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use dashmap::DashMap;
use serde::{Serialize, de::DeserializeOwned};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::mq::{
    MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiver, MessageQueueReceiverTrait,
    MessageQueueTrait,
};

/// Message handler trait - implement this to process messages
#[async_trait]
pub trait MessageHandler: Send + Sync + 'static {
    type Message: DeserializeOwned + Send;

    async fn handle(&self, message: Self::Message) -> anyhow::Result<()>;
}

/// Error action to take after handler fails
pub enum ErrorAction {
    Ack,
    Reject { requeue: bool },
}

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
    TraceSummaries,
    Notifications,
    Clustering,
}

impl std::fmt::Display for WorkerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkerType::Spans => write!(f, "spans"),
            WorkerType::SpansIndexer => write!(f, "spans_indexer"),
            WorkerType::BrowserEvents => write!(f, "browser_events"),
            WorkerType::Evaluators => write!(f, "evaluators"),
            WorkerType::Payloads => write!(f, "payloads"),
            WorkerType::TraceSummaries => write!(f, "trace_summaries"),
            WorkerType::Notifications => write!(f, "notifications"),
            WorkerType::Clustering => write!(f, "clustering"),
        }
    }
}

/// Worker state - for observability only
#[derive(Clone, Debug)]
pub enum WorkerState {
    Starting,
    Idle { since: Instant },
    Processing { started_at: Instant },
    Reconnecting { attempt: u32, started_at: Instant },
}

/// Queue worker that processes messages indefinitely
pub struct QueueWorker<H: MessageHandler> {
    id: Uuid,
    worker_type: WorkerType,
    handler: H,
    queue: Arc<MessageQueue>,
    config: QueueConfig,
    state: Arc<RwLock<WorkerState>>,
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
            state: Arc::new(RwLock::new(WorkerState::Starting)),
        }
    }

    pub fn id(&self) -> Uuid {
        self.id
    }

    pub fn worker_type(&self) -> WorkerType {
        self.worker_type
    }

    pub fn state(&self) -> WorkerState {
        self.state.read().unwrap().clone()
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

        *self.state.write().unwrap() = WorkerState::Idle {
            since: Instant::now(),
        };

        log::info!(
            "Worker {} ({:?}) connected and ready to process messages",
            self.id,
            self.worker_type
        );

        while let Some(delivery) = receiver.receive().await {
            let delivery = delivery?;

            *self.state.write().unwrap() = WorkerState::Processing {
                started_at: Instant::now(),
            };

            let acker = delivery.acker();
            let data = delivery.data();
            let result = self.process_message(&data).await;

            match result {
                Ok(()) => acker.ack().await?,
                Err(ErrorAction::Ack) => acker.ack().await?,
                Err(ErrorAction::Reject { requeue }) => acker.reject(requeue).await?,
            }

            *self.state.write().unwrap() = WorkerState::Idle {
                since: Instant::now(),
            };
        }

        Ok(())
    }

    async fn connect(&self) -> anyhow::Result<MessageQueueReceiver> {
        *self.state.write().unwrap() = WorkerState::Reconnecting {
            attempt: 0,
            started_at: Instant::now(),
        };

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

    async fn process_message(&self, data: &[u8]) -> Result<(), ErrorAction> {
        let message = serde_json::from_slice::<H::Message>(data).map_err(|e| {
            log::error!(
                "Worker {} ({:?}) deserialization failed: {:?}",
                self.id,
                self.worker_type,
                e
            );
            ErrorAction::Reject { requeue: false }
        })?;

        self.handler.handle(message).await.map_err(|e| {
            log::error!(
                "Worker {} ({:?}) handler failed: {:?}",
                self.id,
                self.worker_type,
                e
            );
            ErrorAction::Ack
        })
    }
}

/// Worker pool - simple spawning and tracking
pub struct WorkerPool {
    queue: Arc<MessageQueue>,
}

#[derive(Clone, Serialize)]
pub struct WorkerInfo {
    pub id: Uuid,
    pub worker_type: WorkerType,
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
