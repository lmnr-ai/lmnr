use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};
use dashmap::DashMap;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{
    mpsc::{self, Receiver, Sender},
    Mutex,
};

// TODO: Possibly think about how to generalize the inner type with any
// `T: Clone + Serialize + Deserialize + Send + Sync`
// instead of manually (de)serializing into `Vec<u8>`
pub struct TokioMpscReceiver {
    receiver: Receiver<Vec<u8>>,
}

pub struct TokioMpscDelivery {
    data: Vec<u8>,
}

impl MessageQueueDeliveryTrait for TokioMpscDelivery {
    fn acker(&self) -> MessageQueueAcker {
        MessageQueueAcker::TokioMpscAcker
    }

    fn data(self) -> Vec<u8> {
        self.data
    }
}

impl MessageQueueReceiverTrait for TokioMpscReceiver {
    async fn receive(&mut self) -> Option<anyhow::Result<MessageQueueDelivery>> {
        let payload = self.receiver.recv().await;
        match payload {
            Some(payload) => Some(Ok(TokioMpscDelivery { data: payload }.into())),
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

impl MessageQueueTrait for TokioMpscQueue {
    async fn publish(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        expiration_ms: Option<u32>,
    ) -> anyhow::Result<()> {
        let key = self.key(exchange, routing_key);
        if expiration_ms.is_some() {
            log::warn!("TokioMpscQueue does not support message expiration");
        }

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

        senders.lock().await[max_index]
            .send(message.to_vec())
            .await?;

        Ok(())
    }

    async fn get_receiver(
        &self,
        _queue_name: &str,
        exchange: &str,
        routing_key: &str,
    ) -> anyhow::Result<MessageQueueReceiver> {
        let key = self.key(exchange, routing_key);

        let (sender, receiver) = mpsc::channel(100);
        let tokio_mpsc_receiver = TokioMpscReceiver { receiver };
        self.senders
            .entry(key)
            .or_default()
            .lock()
            .await
            .push(sender);
        Ok(tokio_mpsc_receiver.into())
    }
}
