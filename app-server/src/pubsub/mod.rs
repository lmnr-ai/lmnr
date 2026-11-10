use enum_dispatch::enum_dispatch;
use uuid::Uuid;

use in_memory::InMemoryPubSub;
use redis::RedisPubSub;

pub mod in_memory;
pub mod keys;
pub mod redis;

/// Strongly typed SSE channel identifier
/// Format: "sse:project_id:subscription_key"
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseChannel {
    pub project_id: Uuid,
    pub subscription_key: String,
}

impl SseChannel {
    pub fn new(project_id: Uuid, subscription_key: impl Into<String>) -> Self {
        Self {
            project_id,
            subscription_key: subscription_key.into(),
        }
    }

    /// Parse channel string into SseChannel
    pub fn from_str(channel: &str) -> Result<Self, String> {
        // Keys can hold ':' (session ids are user-supplied); the project id is a UUID and never does.
        let parts: Vec<&str> = channel.splitn(3, ':').collect();
        if parts.len() != 3 || parts[0] != "sse" {
            return Err(format!("Invalid SSE channel format: {}", channel));
        }

        let project_id = Uuid::parse_str(parts[1])
            .map_err(|e| format!("Invalid project_id in channel {}: {}", channel, e))?;

        Ok(Self {
            project_id,
            subscription_key: parts[2].to_string(),
        })
    }

    /// Convert to channel string
    pub fn to_string(&self) -> String {
        format!("sse:{}:{}", self.project_id, self.subscription_key)
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_round_trips_keys_with_colons() {
        let project_id = Uuid::new_v4();
        for key in [
            "traces",
            "session_worker:upkeep",
            "session_linear:abc::c:def",
        ] {
            let channel = SseChannel::new(project_id, key);
            assert_eq!(SseChannel::from_str(&channel.to_string()), Ok(channel));
        }
    }

    #[test]
    fn rejects_malformed_channels() {
        assert!(SseChannel::from_str("sse:traces").is_err());
        assert!(SseChannel::from_str("foo:00000000-0000-0000-0000-000000000000:traces").is_err());
        assert!(SseChannel::from_str("sse:not-a-uuid:session_a:b").is_err());
    }
}
