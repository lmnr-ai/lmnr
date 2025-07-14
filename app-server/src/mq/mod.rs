use enum_dispatch::enum_dispatch;
use lapin::{
    acker::Acker,
    options::{BasicAckOptions, BasicNackOptions, BasicRejectOptions},
};
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

impl MessageQueue {
    /// Creates a receiver with retry logic and exponential backoff
    /// This is useful when RabbitMQ is under memory pressure and may drop connections
    pub async fn get_receiver_with_retry(
        &self,
        queue_name: &str,
        exchange: &str,
        routing_key: &str,
        service_name: &str,
    ) -> MessageQueueReceiver {
        let mut retry_count = 0;
        let mut delay = 1; // Start with 1 second delay

        loop {
            match self.get_receiver(queue_name, exchange, routing_key).await {
                Ok(receiver) => {
                    if retry_count > 0 {
                        log::info!(
                            "Successfully reconnected to {} queue after {} retries",
                            service_name,
                            retry_count
                        );
                    }
                    return receiver;
                }
                Err(e) => {
                    retry_count += 1;
                    log::error!(
                        "Failed to get receiver from {} queue (attempt {}): {:?}",
                        service_name,
                        retry_count,
                        e
                    );

                    // Cap the delay at 60 seconds to prevent excessive wait times
                    let sleep_duration = std::cmp::min(delay, 60);
                    log::warn!(
                        "Retrying {} connection in {} seconds...",
                        service_name,
                        sleep_duration
                    );
                    tokio::time::sleep(tokio::time::Duration::from_secs(sleep_duration)).await;

                    // Exponential backoff: double the delay, up to 60 seconds
                    delay = std::cmp::min(delay * 2, 60);
                    continue;
                }
            }
        }
    }
}
