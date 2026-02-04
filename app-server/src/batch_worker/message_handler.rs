use async_trait::async_trait;
use serde::de::DeserializeOwned;
use std::time::Duration;

/// A message wrapped with its MQ delivery metadata.
/// This allows handlers to return messages that can be properly acked/rejected.
#[derive(Debug, Clone)]
pub struct MessageDelivery<M> {
    pub message: M,
    pub delivery_tag: u64,
}

impl<M> MessageDelivery<M> {
    pub fn new(message: M, delivery_tag: u64) -> Self {
        Self {
            message,
            delivery_tag,
        }
    }
}

/// Result of handling a message and interval tick. Specifies what deliveries to ack, reject, or requeue.
pub struct HandlerResult<M> {
    /// Deliveries to acknowledge (successfully processed)
    pub to_ack: Vec<MessageDelivery<M>>,
    /// Deliveries to reject permanently (unrecoverable error, no requeue)
    pub to_reject: Vec<MessageDelivery<M>>,
    /// Deliveries to requeue (transient error, will be redelivered)
    pub to_requeue: Vec<MessageDelivery<M>>,
}

impl<M> HandlerResult<M> {
    pub fn empty() -> Self {
        Self {
            to_ack: Vec::new(),
            to_reject: Vec::new(),
            to_requeue: Vec::new(),
        }
    }

    pub fn ack(deliveries: Vec<MessageDelivery<M>>) -> Self {
        Self {
            to_ack: deliveries,
            to_reject: Vec::new(),
            to_requeue: Vec::new(),
        }
    }

    pub fn reject(deliveries: Vec<MessageDelivery<M>>) -> Self {
        Self {
            to_ack: Vec::new(),
            to_reject: deliveries,
            to_requeue: Vec::new(),
        }
    }

    pub fn requeue(deliveries: Vec<MessageDelivery<M>>) -> Self {
        Self {
            to_ack: Vec::new(),
            to_reject: Vec::new(),
            to_requeue: deliveries,
        }
    }
}

/// Batch message handler trait - implement this to process messages with internal state.
#[async_trait]
pub trait BatchMessageHandler: Send + Sync + 'static {
    type Message: DeserializeOwned + Send + Sync + Clone;

    /// Internal state of the worker.
    ///
    /// Example: batch(es) of message deliveries.
    type State: Send + Sync + Clone;

    /// The interval at which handle_interval() will be called.
    fn interval(&self) -> Duration;

    /// Returns the initial state for the handler.
    /// Called on worker creation and on reconnection to reset state.
    fn initial_state(&self) -> Self::State;

    /// Handle a single message delivery: update state and decide what to ack/reject/requeue.
    ///
    /// This method should:
    /// 1. Add the delivery to the internal state
    /// 2. Check if any processing should be triggered (e.g., batch full)
    /// 3. Return which deliveries to ack, reject, or requeue
    ///
    /// Example: add delivery to batch, flush if batch size reached.
    async fn handle_message(
        &self,
        delivery: MessageDelivery<Self::Message>,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message>;

    /// Handle periodic interval tick.
    ///
    /// Called at the interval specified by interval().
    /// Returns which deliveries to ack, reject, or requeue.
    ///
    /// Example: flush batches that haven't been flushed for too long.
    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message>;
}
