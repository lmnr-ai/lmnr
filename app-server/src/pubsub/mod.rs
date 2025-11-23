use enum_dispatch::enum_dispatch;

use in_memory::InMemoryPubSub;
use redis::RedisPubSub;

pub mod in_memory;
pub mod keys;
pub mod redis;

#[derive(thiserror::Error, Debug)]
pub enum PubSubError {
    #[error("{0}")]
    InternalError(#[from] anyhow::Error),
    #[error("{0}")]
    SerDeError(#[from] serde_json::Error),
}

#[derive(Debug)]
#[enum_dispatch]
pub enum PubSub {
    InMemory(InMemoryPubSub),
    Redis(RedisPubSub),
}

#[enum_dispatch(PubSub)]
pub trait PubSubTrait {
    /// Publish a message to a channel
    async fn publish(&self, channel: &str, message: &str) -> Result<(), PubSubError>;

    /// Subscribe to a pattern and process messages with a callback
    /// This blocks until the subscription ends
    async fn subscribe<F>(&self, pattern: &str, callback: F) -> Result<(), PubSubError>
    where
        F: FnMut(String, String) + Send + 'static;
}
