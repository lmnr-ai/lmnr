use backoff::ExponentialBackoffBuilder;
use deadpool::managed::{Manager, Pool, PoolError, RecycleError};
use futures_util::StreamExt;
use lapin::{
    BasicProperties, Channel, Consumer,
    acker::Acker,
    options::{BasicConsumeOptions, BasicPublishOptions, BasicQosOptions, QueueBindOptions},
    types::{FieldTable, ShortString},
};
use std::sync::Arc;

use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait, connection::ResilientConnection,
};

struct RabbitChannelManager {
    connection: Arc<ResilientConnection>,
}

impl Manager for RabbitChannelManager {
    type Type = Channel;
    type Error = anyhow::Error;

    async fn create(&self) -> Result<Channel, Self::Error> {
        let create_channel = || async {
            // Read the latest connection on every attempt: if the supervisor
            // swapped a fresh one in mid-backoff we pick it up automatically.
            self.connection
                .current()
                .create_channel()
                .await
                .map_err(|e| {
                    log::warn!("Failed to create channel: {:?}", e);
                    self.connection.notify_error();
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
    publisher_connection: Arc<ResilientConnection>,
    consumer_connection: Option<Arc<ResilientConnection>>,
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
        publisher_connection: Arc<ResilientConnection>,
        consumer_connection: Option<Arc<ResilientConnection>>,
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
        // Build properties with delivery_mode=2 (persistent) and optional TTL
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
                    self.publisher_connection.notify_error();
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

            // Check if channel is still connected before using it
            if !channel.status().connected() {
                log::warn!("Channel is not connected, retrying...");
                self.publisher_connection.notify_error();
                return Err(backoff::Error::transient(anyhow::anyhow!(
                    "Channel is not connected"
                )));
            }

            match channel
                .basic_publish(
                    exchange,
                    routing_key,
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
                        self.publisher_connection.notify_error();
                        Err(backoff::Error::transient(anyhow::Error::from(e)))
                    }
                },
                Err(e) => {
                    log::warn!("Failed to get call promise from basic_publish: {:?}", e);
                    self.publisher_connection.notify_error();
                    Err(backoff::Error::transient(anyhow::Error::from(e)))
                }
            }
        };

        let backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(std::time::Duration::from_millis(100))
            .with_max_interval(std::time::Duration::from_secs(2))
            .with_max_elapsed_time(Some(std::time::Duration::from_secs(60)))
            .build();

        match backoff::future::retry(backoff, publish_with_retry).await {
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

        let connection = consumer_conn.current();
        if !connection.status().connected() {
            consumer_conn.notify_error();
            return Err(anyhow::anyhow!(
                "Consumer connection is not in connected state: {:?}",
                connection.status().state()
            ));
        }

        let channel = match connection.create_channel().await {
            Ok(channel) => channel,
            Err(e) => {
                consumer_conn.notify_error();
                return Err(anyhow::Error::from(e));
            }
        };

        // We want to limit the number of unacknowledged messages RabbitMQ will deliver,
        // preventing unbounded memory growth of rabbitmq pod
        channel
            .basic_qos(prefetch_count, BasicQosOptions::default())
            .await?;

        channel
            .queue_bind(
                queue_name,
                exchange,
                routing_key,
                QueueBindOptions::default(),
                FieldTable::default(),
            )
            .await?;

        let consumer = channel
            .basic_consume(
                queue_name,
                routing_key,
                BasicConsumeOptions::default(),
                FieldTable::default(),
            )
            .await?;

        Ok(RabbitMQReceiver { consumer }.into())
    }

    fn is_healthy(&self) -> bool {
        let publisher_ok = self.publisher_connection.is_connected();
        if !publisher_ok {
            log::error!(
                "RabbitMQ readiness: publisher connection is not connected (state: {:?})",
                self.publisher_connection.current().status().state()
            );
        }

        let consumer_ok = self
            .consumer_connection
            .as_ref()
            .map(|c| {
                let connected = c.is_connected();
                if !connected {
                    log::error!(
                        "RabbitMQ readiness: consumer connection is not connected (state: {:?})",
                        c.current().status().state()
                    );
                }
                connected
            })
            .unwrap_or(true);

        publisher_ok && consumer_ok
    }
}
