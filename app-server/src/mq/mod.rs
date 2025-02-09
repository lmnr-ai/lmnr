use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod rabbit;
pub mod tokio_mpsc;

#[async_trait]
pub trait MessageQueueReceiver<T>: Send + Sync {
    async fn receive(&mut self) -> Option<anyhow::Result<Box<dyn MessageQueueDelivery<T>>>>
    where
        T: for<'de> Deserialize<'de> + Clone;
}

#[async_trait]
pub trait MessageQueueDelivery<T>: Send + Sync {
    async fn ack(&self) -> anyhow::Result<()>;
    fn data(&self) -> T
    where
        T: for<'de> Deserialize<'de> + Clone;
}

#[async_trait]
pub trait MessageQueue<T>: Send + Sync
where
    T: for<'de> Deserialize<'de> + Serialize + Clone + Send + Sync + 'static,
{
    async fn publish(&self, message: &T, exchange: &str, routing_key: &str) -> anyhow::Result<()>;

    async fn get_receiver(
        &self,
        queue_name: &str,
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<Box<dyn MessageQueueReceiver<T>>>;
}
