use std::sync::Arc;

use tokio_util::{sync::CancellationToken, task::TaskTracker};

use crate::mq::MessageQueue;
use crate::worker::QueueConfig;

use super::BatchWorkerType;
use super::message_handler::BatchMessageHandler;
use super::worker::BatchQueueWorker;

pub struct BatchWorkerPool {
    queue: Arc<MessageQueue>,
    shutdown: CancellationToken,
    tasks: TaskTracker,
}

impl BatchWorkerPool {
    /// Workers stop on `shutdown`; `tasks` is what `main` waits on so the process
    /// doesn't exit while one is still finishing a flush + ack.
    pub fn new(queue: Arc<MessageQueue>, shutdown: CancellationToken, tasks: TaskTracker) -> Self {
        Self {
            queue,
            shutdown,
            tasks,
        }
    }

    /// Spawn N workers of a type
    pub fn spawn<H, F>(
        &self,
        worker_type: BatchWorkerType,
        count: usize,
        handler_factory: F,
        config: QueueConfig,
    ) where
        H: BatchMessageHandler,
        F: Fn() -> H + Send + Sync + 'static,
    {
        for i in 0..count {
            let handler = handler_factory();
            let mut worker = BatchQueueWorker::new(
                worker_type,
                handler,
                self.queue.clone(),
                config.clone(),
                self.shutdown.clone(),
            );

            let worker_id = worker.id();

            log::info!(
                "Spawning worker {} ({:?}) instance {}",
                worker_id,
                worker_type,
                i
            );

            self.tasks.spawn(async move {
                worker.process().await;
            });
        }
    }
}
