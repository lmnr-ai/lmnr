use async_trait::async_trait;
use serde::de::DeserializeOwned;
use std::time::Duration;

pub trait UniqueId {
    fn get_unique_id(&self) -> String;
}

/// Result of handling a message and interval tick. Specifies what messages to ack, reject, or requeue.
pub struct HandlerResult<M> {
    /// Messages to acknowledge (successfully processed)
    pub to_ack: Vec<M>,
    /// Messages to reject permanently (unrecoverable error, no requeue)
    pub to_reject: Vec<M>,
    /// Messages to requeue (transient error, will be redelivered)
    pub to_requeue: Vec<M>,
}

impl<M> HandlerResult<M> {
    pub fn empty() -> Self {
        Self {
            to_ack: Vec::new(),
            to_reject: Vec::new(),
            to_requeue: Vec::new(),
        }
    }

    pub fn ack(messages: Vec<M>) -> Self {
        Self {
            to_ack: messages,
            to_reject: Vec::new(),
            to_requeue: Vec::new(),
        }
    }

    pub fn reject(messages: Vec<M>) -> Self {
        Self {
            to_ack: Vec::new(),
            to_reject: messages,
            to_requeue: Vec::new(),
        }
    }

    pub fn requeue(messages: Vec<M>) -> Self {
        Self {
            to_ack: Vec::new(),
            to_reject: Vec::new(),
            to_requeue: messages,
        }
    }
}

/// Batch message handler trait - implement this to process messages with internal state.
#[async_trait]
pub trait BatchMessageHandler: Send + Sync + 'static {
    /// Message must implement UniqueId trait to be able to uniquely identify each message acker
    /// from the response of handle_message() and handle_interval() methods.
    type Message: DeserializeOwned + Send + Sync + Clone + UniqueId;

    /// Internal state of the worker.
    ///
    /// Example: batch(es) of messages.
    type State: Send + Sync + Clone;

    /// The interval at which handle_interval() will be called.
    fn interval(&self) -> Duration;

    /// Returns the initial state for the handler.
    /// Called on worker creation and on reconnection to reset state.
    fn initial_state(&self) -> Self::State;

    /// Handle a single message: update state and decide what to ack/reject/requeue.
    ///
    /// This method should:
    /// 1. Add the message to the internal state
    /// 2. Check if any processing should be triggered (e.g., batch full)
    /// 3. Return which messages to ack, reject, or requeue
    ///
    /// Example: add message to batch, flush if batch size reached.
    async fn handle_message(
        &self,
        message: Self::Message,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message>;

    /// Handle periodic interval tick.
    ///
    /// Called at the interval specified by state_check_interval().
    /// Returns which messages to ack, reject, or requeue.
    ///
    /// Example: flush batches that haven't been flushed for too long.
    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message>;
}
