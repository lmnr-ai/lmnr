use futures_util::StreamExt;
use redis::AsyncCommands;
use std::sync::Arc;

use super::{PubSubError, PubSubTrait};

#[derive(Debug)]
pub struct RedisPubSub {
    client: redis::Client,
    connection: Arc<redis::aio::MultiplexedConnection>,
}

impl RedisPubSub {
    pub async fn new(client: &redis::Client) -> Result<Self, PubSubError> {
        let connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| {
                log::error!("Redis get connection error: {}", e);
                PubSubError::InternalError(anyhow::Error::from(e))
            })?;

        Ok(Self {
            client: client.clone(),
            connection: Arc::new(connection),
        })
    }
}

impl PubSubTrait for RedisPubSub {
    async fn publish(&self, channel: &str, message: &str) -> Result<(), PubSubError> {
        let mut conn = (*self.connection).clone();
        let result: redis::RedisResult<i32> = conn.publish(channel, message).await;
        match result {
            Ok(_count) => Ok(()),
            Err(e) => {
                log::error!("Redis publish error: {}", e);
                Err(PubSubError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn subscribe<F>(&self, pattern: &str, mut callback: F) -> Result<(), PubSubError>
    where
        F: FnMut(String, String) + Send + 'static,
    {
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
