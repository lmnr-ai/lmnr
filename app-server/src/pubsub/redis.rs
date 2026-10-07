use std::sync::Arc;

use futures_util::StreamExt;
use redis::AsyncCommands;

use crate::cache::connection::ResilientRedisConnection;

use super::{PubSubError, PubSubTrait};

pub struct RedisPubSub {
    client: redis::Client,
    connection: Arc<ResilientRedisConnection>,
}

impl std::fmt::Debug for RedisPubSub {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RedisPubSub").finish_non_exhaustive()
    }
}

impl RedisPubSub {
    pub fn new(client: redis::Client, connection: Arc<ResilientRedisConnection>) -> Self {
        Self { client, connection }
    }
}

impl PubSubTrait for RedisPubSub {
    async fn publish(&self, channel: &str, message: &str) -> Result<(), PubSubError> {
        let mut conn = self.connection.current_clone();
        let result: redis::RedisResult<i32> = conn.publish(channel, message).await;
        match result {
            Ok(_count) => Ok(()),
            Err(e) => {
                log::error!("Redis publish error: {}", e);
                self.connection.notify_error();
                Err(PubSubError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn subscribe<F>(&self, pattern: &str, mut callback: F) -> Result<(), PubSubError>
    where
        F: FnMut(String, String) + Send + 'static,
    {
        // Pub/Sub uses a dedicated, non-multiplexed connection (Redis pins the
        // subscription state per socket). Resilience here is "drop the stream
        // and let the caller reconnect" — same as before.
        let mut pubsub = self.client.get_async_pubsub().await.map_err(|e| {
            log::error!("Failed to get async pubsub: {}", e);
            PubSubError::InternalError(anyhow::Error::from(e))
        })?;

        pubsub.psubscribe(pattern).await.map_err(|e| {
            log::error!("Failed to psubscribe to {}: {}", pattern, e);
            PubSubError::InternalError(anyhow::Error::from(e))
        })?;

        log::info!("Redis Pub/Sub subscribed to pattern: {}", pattern);

        let mut stream = pubsub.on_message();

        while let Some(msg) = stream.next().await {
            // get_channel_name() returns &str directly
            // get_payload() returns Result<String, RedisError>
            let channel = msg.get_channel_name().to_string();
            let payload = match msg.get_payload() {
                Ok(p) => p,
                Err(e) => {
                    log::error!("Failed to get payload: {}", e);
                    continue;
                }
            };

            callback(channel, payload);
        }

        log::warn!("Redis Pub/Sub stream ended");
        Ok(())
    }
}
