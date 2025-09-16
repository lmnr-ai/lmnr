use enum_dispatch::enum_dispatch;
use lapin::{
    acker::Acker,
    options::{BasicAckOptions, BasicNackOptions, BasicRejectOptions},
};
pub mod rabbit;
pub mod tokio_mpsc;
pub mod utils;

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
pub enum MessageQueueDelivery {
    Rabbit(RabbitMQDelivery),
    TokioMpsc(TokioMpscDelivery),
}

#[enum_dispatch(MessageQueueReceiver)]
pub trait MessageQueueReceiverTrait {
    async fn receive(&mut self) -> Option<anyhow::Result<MessageQueueDelivery>>;
}

pub enum MessageQueueAcker {
    RabbitAcker(Acker),
    TokioMpscAcker,
}

impl MessageQueueAcker {
    pub async fn ack(&self) -> anyhow::Result<()> {
        match self {
            Self::RabbitAcker(acker) => match acker.ack(BasicAckOptions::default()).await {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!("Failed to ack message: {}", e)),
            },
            Self::TokioMpscAcker => Ok(()),
        }
    }

    #[allow(unused)]
    pub async fn nack(&self, requeue: bool) -> anyhow::Result<()> {
        match self {
            Self::RabbitAcker(acker) => match acker
                .nack(BasicNackOptions {
                    multiple: false,
                    requeue,
                })
                .await
            {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!("Failed to nack message: {}", e)),
            },
            Self::TokioMpscAcker => Ok(()),
        }
    }

    pub async fn reject(&self, requeue: bool) -> anyhow::Result<()> {
        match self {
            Self::RabbitAcker(acker) => match acker.reject(BasicRejectOptions { requeue }).await {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!("Failed to reject message: {}", e)),
            },
            Self::TokioMpscAcker => Ok(()),
        }
    }
}

#[enum_dispatch(MessageQueueDelivery)]
pub trait MessageQueueDeliveryTrait {
    fn acker(&self) -> MessageQueueAcker;
    fn data(self) -> Vec<u8>;
}

#[enum_dispatch(MessageQueue)]
pub trait MessageQueueTrait {
    async fn publish(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<()>;

    async fn get_receiver(
        &self,
        queue_name: &str,
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<MessageQueueReceiver>;
}
