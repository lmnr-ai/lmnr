use std::sync::Arc;

use async_trait::async_trait;

use super::{MessageQueue, MessageQueueDelivery, MessageQueueReceiver};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::{
    mpsc::{self, Receiver, Sender},
    Mutex,
};

// TODO: Possibly think about how to generalize the inner type with any
// `T: Clone + Serialize + Deserialize + Send + Sync`
// instead of manually (de)serializing into `Vec<u8>`
struct TokioMpscReceiver {
    receiver: Receiver<Vec<u8>>,
}

struct TokioMpscDelivery<T> {
    data: T,
}

#[async_trait]
impl<T> MessageQueueDelivery<T> for TokioMpscDelivery<T>
where
    T: for<'de> Deserialize<'de> + Clone + Send + Sync + 'static,
{
    async fn ack(&self) -> anyhow::Result<()> {
        Ok(())
    }

    async fn nack(&self, requeue: bool) -> anyhow::Result<()> {
        if requeue {
            Err(anyhow::anyhow!(
                "Nack with requeue is not supported for TokioMpsc queue"
            ))
        } else {
            Ok(())
        }
    }

    async fn reject(&self, requeue: bool) -> anyhow::Result<()> {
        if requeue {
            Err(anyhow::anyhow!(
                "Reject with requeue is not supported for TokioMpsc queue"
            ))
        } else {
            Ok(())
        }
    }

    fn data(&self) -> T
    where
        T: for<'de> Deserialize<'de> + Clone,
    {
        self.data.clone()
    }
}

#[async_trait]
impl<T> MessageQueueReceiver<T> for TokioMpscReceiver
where
    T: for<'de> Deserialize<'de> + Clone + Send + Sync + 'static,
{
    async fn receive(&mut self) -> Option<anyhow::Result<Box<dyn MessageQueueDelivery<T>>>> {
        let payload = self.receiver.recv().await;
        match payload {
            Some(payload) => {
                let message = serde_json::from_slice(&payload);
                match message {
                    Ok(message) => Some(Ok(Box::new(TokioMpscDelivery { data: message }))),
                    Err(e) => Some(Err(anyhow::anyhow!("Failed to deserialize payload: {}", e))),
                }
            }
            None => None,
        }
    }
}

pub struct TokioMpscQueue {
    senders: DashMap<String, Arc<Mutex<Vec<Sender<Vec<u8>>>>>>,
}

impl TokioMpscQueue {
    pub fn new() -> Self {
        Self {
            senders: DashMap::new(),
        }
    }

    fn key(&self, exchange: &str, routing_key: &str) -> String {
        format!("{}:-:{}", exchange, routing_key)
    }
}

#[async_trait]
impl<T> MessageQueue<T> for TokioMpscQueue
where
    T: for<'de> Deserialize<'de> + Serialize + Clone + Send + Sync + 'static,
{
    async fn publish(&self, message: &T, exchange: &str, routing_key: &str) -> anyhow::Result<()> {
        let key = self.key(exchange, routing_key);

        let Some(senders) = self.senders.get(&key) else {
            return Err(anyhow::anyhow!(
                "Queue mapping for exchange `{}` and routing key `{}` not found",
                exchange,
                routing_key
            ));
        };

        if senders.lock().await.is_empty() {
            return Err(anyhow::anyhow!(
                "No queues exist for exchange `{}` and routing key `{}`",
                exchange,
                routing_key
            ));
        }

        // naive iteration to choose the least busy queue
        let mut max_index = 0;
        let mut max_capacity = 0;
        for (index, sender) in senders.lock().await.iter().enumerate() {
            if sender.capacity() > max_capacity {
                max_capacity = sender.capacity();
                max_index = index;
            }
        }

        let payload = serde_json::to_vec(message)?;
        senders.lock().await[max_index].send(payload).await?;

        Ok(())
    }

    async fn get_receiver(
        &self,
        _queue_name: &str,
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<Box<dyn MessageQueueReceiver<T>>> {
        let key = self.key(exchange, routing_key);

        let (sender, receiver) = mpsc::channel(100);
        let tokio_mpsc_receiver = TokioMpscReceiver { receiver };
        self.senders
            .entry(key)
            .or_default()
            .lock()
            .await
            .push(sender);
        Ok(Box::new(tokio_mpsc_receiver))
    }
}
