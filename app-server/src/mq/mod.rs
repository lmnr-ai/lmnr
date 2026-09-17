use enum_dispatch::enum_dispatch;
use lapin::{
    Acker,
    options::{BasicAckOptions, BasicNackOptions, BasicRejectOptions},
};
// pub mod connection;
pub mod rabbit;
pub mod stream;
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
    fn delivery_tag(&self) -> u64;

    /// Delayed retries this message has already been through, as stamped by
    /// [`MessageQueueTrait::publish_retry`]. `0` on a first delivery.
    ///
    /// A delayed retry republishes the message, so the broker's own redelivery
    /// count restarts at zero and can't bound the loop — this is what does.
    fn retry_attempt(&self) -> u32;

    /// The AMQP `priority` this message arrived with, or `None` when the
    /// publisher set none (which a quorum queue reads as 4).
    ///
    /// Exposed so a worker can echo it back on a republish without knowing what
    /// the payload means: priority is derived from message content at the
    /// original publish site, and re-deriving it in the worker would need the
    /// concrete message type. See `QueueWorker::park_for_retry`.
    fn priority(&self) -> Option<u8>;
}

#[enum_dispatch(MessageQueue)]
pub trait MessageQueueTrait {
    /// Publish a message to an exchange with optional per-message TTL.
    ///
    /// # Arguments
    /// * `message` - The message payload
    /// * `exchange` - The exchange to publish to
    /// * `routing_key` - The routing key
    /// * `ttl_ms` - Optional message TTL in milliseconds. If None, no TTL is set.
    async fn publish(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: Option<u64>,
    ) -> anyhow::Result<()>;

    /// Publish with an explicit AMQP `priority`, so one class of message can
    /// outrank another on the same queue.
    ///
    /// Quorum queues serve strictly by priority — 32 levels (0-31), no
    /// interleaving between them — and read an absent property as 4. Setting
    /// this needs no queue argument: `x-max-priority` is a classic-queue
    /// argument and quorum queues ignore it, so nothing has to be re-declared.
    /// On brokers older than RabbitMQ 4.3 the property is simply ignored.
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    async fn publish_with_priority(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: Option<u64>,
        priority: u8,
    ) -> anyhow::Result<()>;

    /// Publish into a retry queue: the message waits out `ttl_ms` there, then the
    /// broker dead-letters it back into the queue it came from. `attempt` is
    /// stamped on the message so the next delivery knows how much budget is left.
    ///
    /// `priority` is the priority the message is to come back with, normally the
    /// one it arrived with ([`MessageQueueDeliveryTrait::priority`]). Dead-lettering
    /// rewrites the exchange, the routing key and the expiration but not the
    /// priority, so stamping it here is what carries it across the round trip.
    ///
    /// Errors when the transport can't delay (the in-memory queue), so callers
    /// must have a fallback rather than treating this as always available.
    async fn publish_retry(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: u64,
        attempt: u32,
        priority: Option<u8>,
    ) -> anyhow::Result<()>;

    async fn get_receiver(
        &self,
        queue_name: &str,
        exchange: &str,
        routing_key: &str,
        prefetch_count: u16,
    ) -> anyhow::Result<MessageQueueReceiver>;

    /// Check if the message queue connections are healthy.
    /// Returns true if all active connections are in a connected state.
    fn is_healthy(&self) -> bool;
}
