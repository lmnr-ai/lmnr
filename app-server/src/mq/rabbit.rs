use async_trait::async_trait;
use futures::StreamExt;
use lapin::{
    message::Delivery,
    options::{
        BasicAckOptions, BasicConsumeOptions, BasicNackOptions, BasicPublishOptions,
        BasicRejectOptions, QueueBindOptions,
    },
    types::FieldTable,
    BasicProperties, Connection, Consumer,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{
    MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};

pub struct RabbitMQ {
    connection: Arc<Connection>,
}

pub struct RabbitMQReceiver {
    consumer: Consumer,
}

pub struct RabbitMQDelivery<T> {
    delivery: Delivery,
    data: T,
}

#[async_trait]
impl<T> MessageQueueDeliveryTrait<T> for RabbitMQDelivery<T>
where
    T: for<'de> Deserialize<'de> + Clone + Send + Sync,
{
    async fn ack(&self) -> anyhow::Result<()> {
        self.delivery.ack(BasicAckOptions::default()).await?;
        Ok(())
    }

    async fn nack(&self, requeue: bool) -> anyhow::Result<()> {
        self.delivery
            .nack(BasicNackOptions {
                multiple: false,
                requeue,
            })
            .await?;
        Ok(())
    }

    async fn reject(&self, requeue: bool) -> anyhow::Result<()> {
        self.delivery.reject(BasicRejectOptions { requeue }).await?;
        Ok(())
    }

    fn data(&self) -> T {
        self.data.clone()
    }
}

#[async_trait]
impl MessageQueueReceiverTrait for RabbitMQReceiver {
    async fn receive<T>(&mut self) -> Option<anyhow::Result<MessageQueueDelivery<T>>>
    where
        T: for<'de> Deserialize<'de> + Clone + Send + Sync,
    {
        if let Some(delivery) = self.consumer.next().await {
            let Ok(delivery) = delivery else {
                return Some(Err(anyhow::anyhow!(
                    "Failed to get delivery from RabbitMQ."
                )));
            };

            let Ok(payload) = String::from_utf8(delivery.data.clone()) else {
                return Some(Err(anyhow::anyhow!(
                    "Failed to parse delivery data as UTF-8."
                )));
            };

            let payload = serde_json::from_str::<T>(&payload);
            match payload {
                Ok(payload) => Some(Ok(RabbitMQDelivery {
                    delivery,
                    data: payload,
                }
                .into())),
                Err(e) => Some(Err(anyhow::anyhow!("Failed to deserialize payload: {}", e))),
            }
        } else {
            None
        }
    }
}

impl RabbitMQ {
    pub fn new(connection: Arc<Connection>) -> Self {
        Self { connection }
    }
}

#[async_trait]
impl MessageQueueTrait for RabbitMQ {
    async fn publish<T>(&self, message: &T, exchange: &str, routing_key: &str) -> anyhow::Result<()>
    where
        T: Serialize + Clone + Send + Sync,
    {
        let payload = serde_json::to_string(message)?;
        let payload = payload.as_bytes();

        let channel = self.connection.create_channel().await?;

        channel
            .basic_publish(
                exchange,
                routing_key,
                BasicPublishOptions::default(),
                payload,
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
        let channel = self.connection.create_channel().await?;

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
