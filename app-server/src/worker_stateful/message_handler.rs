use async_trait::async_trait;
use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::worker::HandlerError;

pub trait UniqueId {
    fn get_unique_id(&self) -> String;
}

/// Result of processing state - specifies what to do with each message.
pub struct ProcessStateResult<M> {
    /// Messages to acknowledge (successfully processed)
    pub to_ack: Vec<M>,
    /// Messages to reject permanently (unrecoverable error, no requeue)
    pub to_reject: Vec<M>,
    /// Messages to requeue (transient error, will be redelivered)
    pub to_requeue: Vec<M>,
}

impl<M> ProcessStateResult<M> {
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

/// Stateful message handler trait - implement this to process messages with internal state.
#[async_trait]
pub trait StatefulMessageHandler: Send + Sync + 'static {
    /// Message must implement UniqueId trait to be able to uniquely identify each message acker
    /// from the response of process_state_after_message() and process_state_periodic() methods.
    type Message: DeserializeOwned + Send + Sync + Clone + UniqueId;

    /// Internal state of the worker.
    ///
    /// Example: batch(es) of messages.
    type State: Send + Sync + Clone;

    /// The interval at which the process_state_periodic() method will be called.
    fn state_check_interval(&self) -> Duration;

    /// Returns the initial state for the handler.
    /// Called on worker creation and on reconnection to reset state.
    fn initial_state(&self) -> Self::State;

    /// Handle a single message.
    ///
    /// On error, behavior depends on the error type:
    /// - `HandlerError`: Uses embedded requeue flag
    /// - Conversion from `anyhow::Error`: Defaults to reject without requeue
    ///
    /// On success, message is not acked automaticaly, instead it would be acked when
    /// it's returned in process_state_after_message() or process_state_periodic() methods.
    ///
    /// Example: add message to the batch(state).
    async fn handle_message(
        &self,
        message: Self::Message,
        state: &mut Self::State,
    ) -> Result<(), HandlerError>;

    /// Process state after a message is received.
    ///
    /// Returns which messages to ack, reject, or requeue.
    ///
    /// Example: check if batch size is reached and flush if needed.
    async fn process_state_after_message(
        &self,
        message: Self::Message,
        state: &mut Self::State,
    ) -> ProcessStateResult<Self::Message>;

    /// Process state periodically according to the set state timeout.
    ///
    /// Returns which messages to ack, reject, or requeue.
    ///
    /// Example: check if batch wasn't flushed for a long time and flush if needed.
    async fn process_state_periodic(
        &self,
        state: &mut Self::State,
    ) -> ProcessStateResult<Self::Message>;
}
