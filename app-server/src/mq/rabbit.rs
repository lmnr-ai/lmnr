use backoff::ExponentialBackoffBuilder;
use deadpool::managed::{Manager, Pool, PoolError, RecycleError};
use futures_util::StreamExt;
use lapin::{
    BasicProperties, Channel, Connection, Consumer,
    acker::Acker,
    options::{BasicConsumeOptions, BasicPublishOptions, QueueBindOptions},
    types::FieldTable,
};
use std::sync::Arc;

use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};

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
            Err(RecycleError::Backend(anyhow::anyhow!(
                "Channel disconnected"
            )))
        }
    }
}

pub struct RabbitMQ {
    consumer_connection: Arc<Connection>,
    publisher_channel_pool: Pool<RabbitChannelManager>,
}

pub struct RabbitMQReceiver {
    consumer: Consumer,
}

pub struct RabbitMQDelivery {
    acker: Acker,
    data: Vec<u8>,
}

impl MessageQueueDeliveryTrait for RabbitMQDelivery {
    fn acker(&self) -> MessageQueueAcker {
        MessageQueueAcker::RabbitAcker(self.acker.clone())
    }

    fn data(self) -> Vec<u8> {
        self.data
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
            })))
        } else {
            None
        }
    }
}

impl RabbitMQ {
    pub fn new(
        publisher_connection: Arc<Connection>,
        consumer_connection: Arc<Connection>,
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
    ) -> anyhow::Result<()> {
        let channel = match self.publisher_channel_pool.get().await {
            Ok(channel) => channel,
            Err(PoolError::Backend(e)) => {
                log::error!("Failed to get channel from pool: {}", e);
                return Err(anyhow::anyhow!("Failed to get channel from pool: {}", e));
            }
            Err(e) => {
                log::error!("Pool error: {}", e);
                return Err(anyhow::anyhow!("Pool error: {}", e));
            }
        };

        channel
            .basic_publish(
                exchange,
                routing_key,
                BasicPublishOptions::default(),
                message,
                BasicProperties::default(),
            )
            .await?
            .await?;

        Ok(())
    }

    async fn get_receiver(
        &self,
        queue_name: &str,
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<MessageQueueReceiver> {
        let channel = self.consumer_connection.create_channel().await?;

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
}
