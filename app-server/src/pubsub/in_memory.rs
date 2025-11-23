use std::collections::HashMap;
use std::sync::Arc;

use futures_util::StreamExt;
use tokio::sync::{Mutex, mpsc};
use tokio_stream::wrappers::UnboundedReceiverStream;

use super::{PubSubError, PubSubTrait};

type Subscriber = mpsc::UnboundedSender<(String, String)>;
type Subscribers = Arc<Mutex<HashMap<String, Vec<Subscriber>>>>;

#[derive(Debug, Clone)]
pub struct InMemoryPubSub {
    subscribers: Subscribers,
}

impl InMemoryPubSub {
    pub fn new() -> Self {
        Self {
            subscribers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn matches_pattern(pattern: &str, channel: &str) -> bool {
        // Simple pattern matching: supports * wildcard
        // e.g., "sse:*:*" matches "sse:123:trace_456"
        let pattern_parts: Vec<&str> = pattern.split(':').collect();
        let channel_parts: Vec<&str> = channel.split(':').collect();

        if pattern_parts.len() != channel_parts.len() {
            return false;
        }

        pattern_parts
            .iter()
            .zip(channel_parts.iter())
            .all(|(p, c)| *p == "*" || *p == *c)
    }
}

impl PubSubTrait for InMemoryPubSub {
    async fn publish(&self, channel: &str, message: &str) -> Result<(), PubSubError> {
        let subscribers = self.subscribers.lock().await;

        // Find all patterns that match this channel
        for (pattern, subs) in subscribers.iter() {
            if Self::matches_pattern(pattern, channel) {
                for subscriber in subs {
                    if let Err(e) = subscriber.send((channel.to_string(), message.to_string())) {
                        log::warn!("Failed to send message to in-memory subscriber: {:?}", e);
                    }
                }
            }
        }

        Ok(())
    }

    async fn subscribe<F>(&self, pattern: &str, mut callback: F) -> Result<(), PubSubError>
    where
        F: FnMut(String, String) + Send + 'static,
    {
        let (sender, receiver) = mpsc::unbounded_channel();

        // Add subscriber to the pattern
        {
            let mut subscribers = self.subscribers.lock().await;
            subscribers
                .entry(pattern.to_string())
                .or_insert_with(Vec::new)
                .push(sender);
        }

        log::info!("In-memory Pub/Sub subscribed to pattern: {}", pattern);

        // Process messages from the channel
        let mut stream = UnboundedReceiverStream::new(receiver);
        while let Some((channel, payload)) = stream.next().await {
            callback(channel, payload);
        }

        log::warn!("In-memory Pub/Sub stream ended for pattern: {}", pattern);
        Ok(())
    }
}
