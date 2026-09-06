use backon::Retryable;
use deadpool::managed::{Manager, Pool, PoolError, RecycleError};
use futures_util::StreamExt;
use lapin::{
    Acker, BasicProperties, Channel, Connection, ConnectionStatus, Consumer,
    options::{BasicConsumeOptions, BasicPublishOptions, BasicQosOptions, QueueBindOptions},
    types::{AMQPValue, FieldTable, ShortString},
};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};
use crate::utils::retry;

/// `backon` decides retryability from the error value alone, so the publish
/// closure's failures — all `anyhow::Error` — need the transient/permanent
/// split that `backoff::Error` used to carry alongside them.
#[derive(thiserror::Error, Debug)]
enum PublishError {
    #[error("{0}")]
    Transient(anyhow::Error),
    #[error("{0}")]
    Permanent(anyhow::Error),
}

/// Whole-chain timeout for consumer setup (`create_channel` → `basic_qos` →
/// `queue_bind` → `basic_consume`). Tunable because a memory-pressured broker
/// can leave channel ops stalled for tens of seconds before the alarm clears.
static CONSUMER_SETUP_TIMEOUT: LazyLock<Duration> =
    LazyLock::new(|| Duration::from_secs(crate::env::mq::CONSUMER_SETUP_TIMEOUT_SECS.get()));

/// Carries the delayed-retry count across a retry-queue round trip. RabbitMQ
/// preserves headers through dead-lettering, so the value survives the hop back
/// into the origin queue.
const RETRY_ATTEMPT_HEADER: &str = "x-lmnr-retry-attempt";

fn retry_properties(ttl_ms: u64, attempt: u32) -> BasicProperties {
    let mut headers = FieldTable::default();
    headers.insert(RETRY_ATTEMPT_HEADER.into(), AMQPValue::LongUInt(attempt));

    BasicProperties::default()
        .with_delivery_mode(2)
        .with_expiration(ShortString::from(ttl_ms.to_string()))
        .with_headers(headers)
}

/// Anything but the `LongUInt` written by `retry_properties` reads as a first
/// delivery, which restarts the budget rather than dropping the message early.
fn retry_attempt_of(properties: &BasicProperties) -> u32 {
    properties
        .headers()
        .as_ref()
        .and_then(|headers| headers.inner().get(RETRY_ATTEMPT_HEADER))
        .and_then(|value| match value {
            AMQPValue::LongUInt(n) => Some(*n),
            _ => None,
        })
        .unwrap_or(0)
}

struct RabbitChannelManager {
    connection: Arc<Connection>,
}

impl Manager for RabbitChannelManager {
    type Type = Channel;
    type Error = anyhow::Error;

    async fn create(&self) -> Result<Channel, Self::Error> {
        let create_channel = || async { self.connection.create_channel().await };
        let backoff = retry::bounded_delay(
            Duration::from_millis(100),
            Duration::from_secs(5),
            Duration::from_secs(30),
        );

        match create_channel
            .retry(backoff)
            .notify(|e, _| log::warn!("Failed to create channel: {:?}", e))
            .await
        {
            Ok(channel) => {
                log::debug!("Successfully created channel");
                Ok(channel)
            }
            Err(e) => {
                log::error!("Failed to create channel after retries: {:?}", e);
                Err(anyhow::anyhow!(
                    "Failed to create channel after retries: {:?}",
                    e
                ))
            }
        }
    }

    async fn recycle(
        &self,
        channel: &mut Channel,
        _: &deadpool::managed::Metrics,
    ) -> deadpool::managed::RecycleResult<Self::Error> {
        if channel.status().connected() {
            Ok(())
        } else {
            log::debug!("Channel is not connected, marking for recycling");
            Err(RecycleError::Backend(anyhow::anyhow!(
                "Channel disconnected"
            )))
        }
    }
}

pub struct RabbitMQ {
    publisher_connection: Arc<Connection>,
    consumer_connection: Option<Arc<Connection>>,
    publisher_channel_pool: Pool<RabbitChannelManager>,
}

pub struct RabbitMQReceiver {
    consumer: Consumer,
}

pub struct RabbitMQDelivery {
    acker: Acker,
    data: Vec<u8>,
    delivery_tag: u64,
    retry_attempt: u32,
}

impl MessageQueueDeliveryTrait for RabbitMQDelivery {
    fn acker(&self) -> MessageQueueAcker {
        MessageQueueAcker::RabbitAcker(self.acker.clone())
    }

    fn data(self) -> Vec<u8> {
        self.data
    }

    fn delivery_tag(&self) -> u64 {
        self.delivery_tag
    }

    fn retry_attempt(&self) -> u32 {
        self.retry_attempt
    }
}

impl MessageQueueReceiverTrait for RabbitMQReceiver {
    async fn receive(&mut self) -> Option<anyhow::Result<MessageQueueDelivery>> {
        if let Some(delivery) = self.consumer.next().await {
            let Ok(delivery) = delivery else {
                return Some(Err(anyhow::anyhow!(
                    "Failed to get delivery from RabbitMQ."
                )));
            };

            Some(Ok(MessageQueueDelivery::Rabbit(RabbitMQDelivery {
                acker: delivery.acker,
                data: delivery.data,
                delivery_tag: delivery.delivery_tag,
                retry_attempt: retry_attempt_of(&delivery.properties),
            })))
        } else {
            None
        }
    }
}

impl RabbitMQ {
    pub fn new(
        publisher_connection: Arc<Connection>,
        consumer_connection: Option<Arc<Connection>>,
        max_channel_pool_size: usize,
    ) -> Self {
        let manager = RabbitChannelManager {
            connection: Arc::clone(&publisher_connection),
        };

        let pool = Pool::builder(manager)
            .max_size(max_channel_pool_size)
            .build()
            .unwrap();

        Self {
            publisher_connection,
            consumer_connection,
            publisher_channel_pool: pool,
        }
    }

    /// Publish with pre-built properties, using a channel from the pool to avoid
    /// creating a new channel for each message.
    async fn publish_inner(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        properties: BasicProperties,
    ) -> anyhow::Result<()> {
        let publish_with_retry = || async {
            let channel = match self.publisher_channel_pool.get().await {
                Ok(channel) => channel,
                Err(PoolError::Backend(e)) => {
                    log::warn!("Failed to get channel from pool: {}", e);
                    return Err(PublishError::Transient(anyhow::anyhow!(
                        "Failed to get channel from pool: {}",
                        e
                    )));
                }
                Err(e) => {
                    log::error!("Pool error: {}", e);
                    return Err(PublishError::Permanent(anyhow::anyhow!(
                        "Pool error: {}",
                        e
                    )));
                }
            };

            // Check if channel is still connected before using it
            if !channel.status().connected() {
                log::warn!("Channel is not connected, retrying...");
                return Err(PublishError::Transient(anyhow::anyhow!(
                    "Channel is not connected"
                )));
            }

            match channel
                .basic_publish(
                    exchange.into(),
                    routing_key.into(),
                    BasicPublishOptions::default(),
                    message,
                    properties.clone(),
                )
                .await
            {
                Ok(promise) => match promise.await {
                    Ok(_confirmation) => Ok(()),
                    Err(e) => {
                        log::warn!("Failed to publish message promise: {:?}", e);
                        Err(PublishError::Transient(anyhow::Error::from(e)))
                    }
                },
                Err(e) => {
                    log::warn!("Failed to get call promise from basic_publish: {:?}", e);
                    Err(PublishError::Transient(anyhow::Error::from(e)))
                }
            }
        };

        let backoff = retry::bounded_delay(
            Duration::from_millis(100),
            Duration::from_secs(2),
            Duration::from_secs(60),
        );

        match publish_with_retry
            .retry(backoff)
            .when(|e| matches!(e, PublishError::Transient(_)))
            .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                log::error!("Failed to publish message after retries: {:?}", e);
                Err(anyhow::anyhow!(
                    "Failed to publish message after retries: {:?}",
                    e
                ))
            }
        }
    }
}

impl MessageQueueTrait for RabbitMQ {
    async fn publish(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: Option<u64>,
    ) -> anyhow::Result<()> {
        // delivery_mode=2 is persistent
        let properties = BasicProperties::default().with_delivery_mode(2);
        let properties = match ttl_ms {
            Some(ttl) => properties.with_expiration(ShortString::from(ttl.to_string())),
            None => properties,
        };

        self.publish_inner(message, exchange, routing_key, properties)
            .await
    }

    async fn publish_retry(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: u64,
        attempt: u32,
    ) -> anyhow::Result<()> {
        self.publish_inner(
            message,
            exchange,
            routing_key,
            retry_properties(ttl_ms, attempt),
        )
        .await
    }

    async fn get_receiver(
        &self,
        queue_name: &str,
        exchange: &str,
        routing_key: &str,
        prefetch_count: u16,
    ) -> anyhow::Result<MessageQueueReceiver> {
        let consumer_conn = self.consumer_connection.as_ref().ok_or_else(|| {
            anyhow::anyhow!(
                "Consumer connection not available - running in producer-only mode. \
                 Cannot create receiver for queue '{}'",
                queue_name
            )
        })?;

        if !consumer_conn.status().connected() {
            return Err(anyhow::anyhow!(
                "Consumer connection is not in connected state: {:?}",
                connection_state(consumer_conn.status())
            ));
        }

        // Bound the entire setup chain. lapin can hang inside `basic_consume` /
        // `create_channel` against a half-dead connection; without this the
        // worker's outer backoff retry never fires another attempt.
        let setup = async {
            let channel = consumer_conn
                .create_channel()
                .await
                .map_err(|e| anyhow::Error::from(e))?;

            channel
                .basic_qos(prefetch_count, BasicQosOptions::default())
                .await?;

            channel
                .queue_bind(
                    queue_name.into(),
                    exchange.into(),
                    routing_key.into(),
                    QueueBindOptions::default(),
                    FieldTable::default(),
                )
                .await?;

            let consumer = channel
                .basic_consume(
                    queue_name.into(),
                    routing_key.into(),
                    BasicConsumeOptions::default(),
                    FieldTable::default(),
                )
                .await?;

            anyhow::Ok(consumer)
        };

        let consumer = match tokio::time::timeout(*CONSUMER_SETUP_TIMEOUT, setup).await {
            Ok(Ok(consumer)) => consumer,
            Ok(Err(e)) => return Err(e),
            Err(_) => {
                return Err(anyhow::anyhow!(
                    "Timed out setting up RabbitMQ consumer for queue '{}'",
                    queue_name
                ));
            }
        };

        Ok(RabbitMQReceiver { consumer }.into())
    }

    fn is_healthy(&self) -> bool {
        let publisher_ok = self.publisher_connection.status().connected();
        if !publisher_ok {
            log::error!(
                "RabbitMQ readiness: publisher connection is not connected (state: {:?})",
                connection_state(self.publisher_connection.status())
            );
        }

        let consumer_ok = self
            .consumer_connection
            .as_ref()
            .map(|c| {
                let connected = c.status().connected();
                if !connected {
                    log::error!(
                        "RabbitMQ readiness: consumer connection is not connected (state: {:?})",
                        connection_state(c.status())
                    );
                }
                connected
            })
            .unwrap_or(true);

        publisher_ok && consumer_ok
    }
}

fn connection_state(status: &ConnectionStatus) -> String {
    let s = if status.blocked() {
        "blocked"
    } else if status.closed() {
        "closed"
    } else if status.closing() {
        "closing"
    } else if status.connected() {
        "connected"
    } else if status.connecting() {
        "connecting"
    } else if status.errored() {
        "errored"
    } else if status.reconnecting() {
        "reconnecting"
    } else {
        "unknown"
    };
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_attempt_round_trips_through_message_properties() {
        assert_eq!(retry_attempt_of(&retry_properties(30_000, 7)), 7);
    }

    #[test]
    fn retry_attempt_of_a_first_delivery_is_zero() {
        // Nothing published by `publish` carries the header.
        let properties = BasicProperties::default().with_delivery_mode(2);
        assert_eq!(retry_attempt_of(&properties), 0);

        let mut headers = FieldTable::default();
        headers.insert("x-death".into(), AMQPValue::LongUInt(4));
        assert_eq!(
            retry_attempt_of(&BasicProperties::default().with_headers(headers)),
            0
        );
    }

    #[test]
    fn a_header_written_by_something_else_restarts_the_budget() {
        // Not written by `retry_properties`, so the count is unusable. Restarting
        // is the safe reading — it retries more, it doesn't drop early.
        let mut wrong_type = FieldTable::default();
        wrong_type.insert(
            RETRY_ATTEMPT_HEADER.into(),
            AMQPValue::LongString("3".into()),
        );
        assert_eq!(
            retry_attempt_of(&BasicProperties::default().with_headers(wrong_type)),
            0
        );
    }
}
