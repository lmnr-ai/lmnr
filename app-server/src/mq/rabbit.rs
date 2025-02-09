use async_trait::async_trait;
use futures::StreamExt;
use lapin::{
    message::Delivery,
    options::{BasicAckOptions, BasicConsumeOptions, BasicPublishOptions, QueueBindOptions},
    types::FieldTable,
    BasicProperties, Connection, Consumer,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{MessageQueue, MessageQueueDelivery, MessageQueueReceiver};

pub struct RabbitMQ {
    connection: Arc<Connection>,
}

struct RabbitMQReceiver {
    consumer: Consumer,
}

struct RabbitMQDelivery<T> {
    delivery: Delivery,
    data: T,
}

#[async_trait]
impl<T> MessageQueueDelivery<T> for RabbitMQDelivery<T>
where
    T: for<'de> Deserialize<'de> + Clone + Send + Sync,
{
    async fn ack(&self) -> anyhow::Result<()> {
        self.delivery.ack(BasicAckOptions::default()).await?;
        Ok(())
    }

    fn data(&self) -> T {
        self.data.clone()
    }
}

#[async_trait]
impl<T> MessageQueueReceiver<T> for RabbitMQReceiver
where
    T: for<'de> Deserialize<'de> + Clone + Send + Sync + 'static,
{
    async fn receive(&mut self) -> Option<anyhow::Result<Box<dyn MessageQueueDelivery<T>>>> {
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
                Ok(payload) => Some(Ok(Box::new(RabbitMQDelivery {
                    delivery,
                    data: payload,
                }))),
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
impl<T> MessageQueue<T> for RabbitMQ
where
    T: for<'de> Deserialize<'de> + Serialize + Clone + Send + Sync + 'static,
{
    async fn publish(&self, message: &T, exchange: &str, routing_key: &str) -> anyhow::Result<()> {
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
    ) -> anyhow::Result<Box<dyn MessageQueueReceiver<T>>>
    where
        T: for<'de> Deserialize<'de> + Clone + Send + Sync + 'static,
    {
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

        Ok(Box::new(RabbitMQReceiver { consumer }))
    }
}
