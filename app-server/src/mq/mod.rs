use async_trait::async_trait;
use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};

pub mod rabbit;
pub mod tokio_mpsc;

use rabbit::{RabbitMQ, RabbitMQDelivery, RabbitMQReceiver};
use tokio_mpsc::{TokioMpscDelivery, TokioMpscQueue, TokioMpscReceiver};

#[enum_dispatch]
pub enum MessageQueue {
    Rabbit(RabbitMQ),
    TokioMpsc(TokioMpscQueue),
}

#[enum_dispatch]
pub enum MessageQueueReceiver {
    Rabbit(RabbitMQReceiver),
    TokioMpsc(TokioMpscReceiver),
}

#[enum_dispatch]
pub enum MessageQueueDelivery<T>
where
    T: for<'de> Deserialize<'de> + Clone + Send + Sync,
{
    Rabbit(RabbitMQDelivery<T>),
    TokioMpsc(TokioMpscDelivery<T>),
}

#[async_trait]
#[enum_dispatch(MessageQueueReceiver)]
pub trait MessageQueueReceiverTrait: Send + Sync {
    async fn receive<T>(&mut self) -> Option<anyhow::Result<MessageQueueDelivery<T>>>
    where
        T: for<'de> Deserialize<'de> + Clone + Send + Sync;
}

#[async_trait]
#[enum_dispatch(MessageQueueDelivery<T>)]
pub trait MessageQueueDeliveryTrait<T>: Send + Sync
where
    T: for<'de> Deserialize<'de> + Clone + Send + Sync,
{
    async fn ack(&self) -> anyhow::Result<()>;
    async fn nack(&self, requeue: bool) -> anyhow::Result<()>;
    async fn reject(&self, requeue: bool) -> anyhow::Result<()>;
    fn data(&self) -> T;
}

#[async_trait]
#[enum_dispatch(MessageQueue)]
pub trait MessageQueueTrait: Send + Sync {
    async fn publish<T>(
        &self,
        message: &T,
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<()>
    where
        T: Serialize + Clone + Send + Sync;

    async fn get_receiver(
        &self,
        queue_name: &str,
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<MessageQueueReceiver>;
}
