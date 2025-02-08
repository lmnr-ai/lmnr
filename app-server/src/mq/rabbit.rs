use async_trait::async_trait;
use futures::StreamExt;
use lapin::{
    message::Delivery,
    options::{
        BasicAckOptions, BasicConsumeOptions, BasicPublishOptions, ExchangeDeclareOptions,
        QueueBindOptions, QueueDeclareOptions,
    },
    types::FieldTable,
    BasicProperties, Connection, ConnectionProperties, Consumer, ExchangeKind,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{MQDelivery, MQReceiver, MessageQueue};
use crate::traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, OBSERVATIONS_ROUTING_KEY};

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
impl<T> MQDelivery<T> for RabbitMQDelivery<T>
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
impl<T> MQReceiver<T> for RabbitMQReceiver
where
    T: for<'de> Deserialize<'de> + Clone + Send + Sync + 'static,
{
    async fn receive(&mut self) -> Option<anyhow::Result<Box<dyn MQDelivery<T>>>> {
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
    pub async fn create(url: &str) -> Self {
        let connection = Connection::connect(url, ConnectionProperties::default())
            .await
            .unwrap();

        // declare the exchange
        let channel = connection.create_channel().await.unwrap();

        channel
            .exchange_declare(
                OBSERVATIONS_EXCHANGE,
                ExchangeKind::Fanout,
                ExchangeDeclareOptions::default(),
                FieldTable::default(),
            )
            .await
            .unwrap();

        channel
            .queue_declare(
                OBSERVATIONS_QUEUE,
                QueueDeclareOptions::default(),
                FieldTable::default(),
            )
            .await
            .unwrap();

        Self {
            connection: Arc::new(connection),
        }
    }
}

#[async_trait]
impl<T> MessageQueue<T> for RabbitMQ
where
    T: for<'de> Deserialize<'de> + Serialize + Clone + Send + Sync + 'static,
{
    async fn publish(
        &self,
        message: &T,
        exchange: Option<&str>,
        routing_key: Option<&str>,
    ) -> anyhow::Result<()> {
        let payload = serde_json::to_string(message)?;
        let payload = payload.as_bytes();

        let channel = self.connection.create_channel().await?;

        channel
            .basic_publish(
                exchange.unwrap_or(OBSERVATIONS_EXCHANGE),
                routing_key.unwrap_or(OBSERVATIONS_ROUTING_KEY),
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
        queue_name: Option<&str>,
        exchange: Option<&str>,
        routing_key: Option<&str>,
    ) -> anyhow::Result<Box<dyn MQReceiver<T>>>
    where
        T: for<'de> Deserialize<'de> + Clone + Send + Sync + 'static,
    {
        let channel = self.connection.create_channel().await?;

        channel
            .queue_bind(
                queue_name.unwrap_or(OBSERVATIONS_QUEUE),
                exchange.unwrap_or(OBSERVATIONS_EXCHANGE),
                routing_key.unwrap_or(OBSERVATIONS_ROUTING_KEY),
                QueueBindOptions::default(),
                FieldTable::default(),
            )
            .await?;

        let consumer = channel
            .basic_consume(
                queue_name.unwrap_or(OBSERVATIONS_QUEUE),
                routing_key.unwrap_or(OBSERVATIONS_ROUTING_KEY),
                BasicConsumeOptions::default(),
                FieldTable::default(),
            )
            .await?;

        Ok(Box::new(RabbitMQReceiver { consumer }))
    }
}
