use futures::StreamExt;
use lapin::{
    acker::Acker,
    options::{BasicConsumeOptions, BasicPublishOptions, QueueBindOptions},
    types::FieldTable,
    BasicProperties, Connection, Consumer,
};
use std::sync::Arc;

use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};

pub struct RabbitMQ {
    connection: Arc<Connection>,
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
    pub fn new(connection: Arc<Connection>) -> Self {
        Self { connection }
    }
}

impl MessageQueueTrait for RabbitMQ {
    async fn publish(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<()> {
        let channel = self.connection.create_channel().await?;

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
