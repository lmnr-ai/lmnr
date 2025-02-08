use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod rabbit;
pub mod tokio_mpsc;

#[async_trait]
pub trait MQReceiver<T>: Send + Sync {
    async fn receive(&mut self) -> Option<anyhow::Result<Box<dyn MQDelivery<T>>>>
    where
        T: for<'de> Deserialize<'de> + Clone;
}

#[async_trait]
pub trait MQDelivery<T>: Send + Sync {
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
    async fn publish(
        &self,
        message: &T,
        exchange: Option<&str>,
        routing_key: Option<&str>,
    ) -> anyhow::Result<()>;

    async fn get_receiver(
        &self,
        queue_name: Option<&str>,
        exchange: Option<&str>,
        routing_key: Option<&str>,
    ) -> anyhow::Result<Box<dyn MQReceiver<T>>>;
}
