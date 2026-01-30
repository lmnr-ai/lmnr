use backoff::ExponentialBackoffBuilder;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};
use crate::worker::{HandlerError, QueueConfig};
use crate::worker_stateful::StatefulWorkerType;
use crate::worker_stateful::message_handler::{StatefulMessageHandler, UniqueId};

/// Queue worker with internal state that processes messages indefinitely and processes state
/// periodically or along with a message.
pub struct StatefulQueueWorker<H: StatefulMessageHandler> {
    id: Uuid,
    worker_type: StatefulWorkerType,
    handler: H,
    queue: Arc<MessageQueue>,
    config: QueueConfig,
    state: H::State,
    ackers: HashMap<String, MessageQueueAcker>,
}

impl<H: StatefulMessageHandler> StatefulQueueWorker<H> {
    pub fn new(
        worker_type: StatefulWorkerType,
        handler: H,
        queue: Arc<MessageQueue>,
        config: QueueConfig,
        initial_state: H::State,
    ) -> Self {
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
                    log::debug!("Processing message: {:?}", message.get_unique_id());

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

    /// Handle the result of state processing (ack/reject messages)
    async fn handle_process_state_result(
        &mut self,
        result: (Vec<H::Message>, Option<HandlerError>),
    ) -> anyhow::Result<()> {
        let (messages, error) = result;

        match error {
            None => {
                // Success - ack all messages
                if !messages.is_empty() {
                    log::debug!(
                        "Worker {} ({:?}) processing state successful, messages to ack: {}",
                        self.id,
                        self.worker_type,
                        messages.len()
                    );
                    self.ack_messages(&messages).await?;
                }
            }
            Some(handler_error) => {
                if !messages.is_empty() {
                    let should_requeue = handler_error.should_requeue();
                    log::error!(
                        "Worker {} ({:?}) error, rejecting {} messages with requeue={}: {:?}",
                        self.id,
                        self.worker_type,
                        messages.len(),
                        should_requeue,
                        handler_error
                    );
                    self.reject_messages(&messages, should_requeue).await;
                }
            }
        }
        Ok(())
    }

    /// Ack messages in parallel
    async fn ack_messages(&mut self, messages: &[H::Message]) -> anyhow::Result<()> {
        let ack_futures: Vec<_> = messages
            .iter()
            .filter_map(|msg| {
                self.ackers
                    .remove(&msg.get_unique_id())
                    .map(|acker| async move { acker.ack().await })
            })
            .collect();

        let results = futures_util::future::join_all(ack_futures).await;
        for result in results {
            result?;
        }
        Ok(())
    }

    /// Reject specific messages in parallel
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
