use backoff::ExponentialBackoffBuilder;
use deadpool::managed::{Manager, Pool, PoolError, RecycleError};
use futures_util::StreamExt;
use lapin::{
    Acker, BasicProperties, Channel, Connection, ConnectionStatus, Consumer,
    options::{BasicConsumeOptions, BasicPublishOptions, BasicQosOptions, QueueBindOptions},
    types::{FieldTable, ShortString},
};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};

/// Whole-chain timeout for consumer setup (`create_channel` → `basic_qos` →
/// `queue_bind` → `basic_consume`). Tunable because a memory-pressured broker
/// can leave channel ops stalled for tens of seconds before the alarm clears.
static CONSUMER_SETUP_TIMEOUT: LazyLock<Duration> = LazyLock::new(|| {
    let secs = std::env::var("RABBITMQ_CONSUMER_SETUP_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60);
    Duration::from_secs(secs)
});

/// Hard ceiling for `publish_best_effort` — secondary, reproducible payloads
/// (Quickwit indexer, signals queue). Kept short so a broker under memory
/// pressure surfaces failure fast and the caller can drop instead of holding
/// the consumer pipeline open while the long primary-publish retry runs.
static BEST_EFFORT_PUBLISH_BUDGET: LazyLock<Duration> = LazyLock::new(|| {
    let secs = std::env::var("RABBITMQ_BEST_EFFORT_PUBLISH_BUDGET_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(3);
    Duration::from_secs(secs)
});

struct RabbitChannelManager {
    connection: Arc<Connection>,
}

impl Manager for RabbitChannelManager {
    type Type = Channel;
    type Error = anyhow::Error;

    async fn create(&self) -> Result<Channel, Self::Error> {
        let create_channel = || async {
            self.connection.create_channel().await.map_err(|e| {
                log::warn!("Failed to create channel: {:?}", e);
                backoff::Error::transient(anyhow::Error::from(e))
            })
        };
        let backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(std::time::Duration::from_millis(100))
            .with_max_interval(std::time::Duration::from_secs(5))
            .with_max_elapsed_time(Some(std::time::Duration::from_secs(30)))
            .build();

        match backoff::future::retry(backoff, create_channel).await {
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
}

impl RabbitMQ {
    async fn publish_with_envelope(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: Option<u64>,
        max_interval: Duration,
        max_elapsed_time: Duration,
    ) -> anyhow::Result<()> {
        let properties = BasicProperties::default().with_delivery_mode(2);
        let properties = match ttl_ms {
            Some(ttl) => properties.with_expiration(ShortString::from(ttl.to_string())),
            None => properties,
        };

        let publish_with_retry = || async {
            let channel = match self.publisher_channel_pool.get().await {
                Ok(channel) => channel,
                Err(PoolError::Backend(e)) => {
                    log::warn!("Failed to get channel from pool: {}", e);
                    return Err(backoff::Error::transient(anyhow::anyhow!(
                        "Failed to get channel from pool: {}",
                        e
                    )));
                }
                Err(e) => {
                    log::error!("Pool error: {}", e);
                    return Err(backoff::Error::permanent(anyhow::anyhow!(
                        "Pool error: {}",
                        e
                    )));
                }
            };

            if !channel.status().connected() {
                log::warn!("Channel is not connected, retrying...");
                return Err(backoff::Error::transient(anyhow::anyhow!(
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
                        Err(backoff::Error::transient(anyhow::Error::from(e)))
                    }
                },
                Err(e) => {
                    log::warn!("Failed to get call promise from basic_publish: {:?}", e);
                    Err(backoff::Error::transient(anyhow::Error::from(e)))
                }
            }
        };

        let backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(Duration::from_millis(100))
            .with_max_interval(max_interval)
            .with_max_elapsed_time(Some(max_elapsed_time))
            .build();

        match backoff::future::retry(backoff, publish_with_retry).await {
            Ok(()) => Ok(()),
            Err(e) => Err(anyhow::anyhow!(
                "Failed to publish message after retries: {:?}",
                e
            )),
        }
    }
}

impl MessageQueueTrait for RabbitMQ {
    /// Publish a message to a RabbitMQ exchange.
    /// It uses a channel from the pool to publish the message.
    /// We use a channel from the pool to avoid creating a new channel for each message.
    async fn publish(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: Option<u64>,
    ) -> anyhow::Result<()> {
        match self
            .publish_with_envelope(
                message,
                exchange,
                routing_key,
                ttl_ms,
                Duration::from_secs(2),
                Duration::from_secs(60),
            )
            .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                log::error!("Failed to publish message after retries: {:?}", e);
                Err(e)
            }
        }
    }

    /// Tight-budget publish for reproducible secondary payloads. The retry
    /// envelope caps at `BEST_EFFORT_PUBLISH_BUDGET` and the whole call is
    /// also wrapped in `tokio::time::timeout` as a hard ceiling — a stuck
    /// `basic_publish` against a flow-controlled broker can't pin the
    /// caller past that bound.
    async fn publish_best_effort(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: Option<u64>,
    ) -> anyhow::Result<()> {
        let budget = *BEST_EFFORT_PUBLISH_BUDGET;
        let attempt = self.publish_with_envelope(
            message,
            exchange,
            routing_key,
            ttl_ms,
            Duration::from_millis(500),
            budget,
        );
        match tokio::time::timeout(budget, attempt).await {
            Ok(res) => res,
            Err(_) => Err(anyhow::anyhow!(
                "Best-effort publish exceeded {}ms ceiling",
                budget.as_millis()
            )),
        }
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
