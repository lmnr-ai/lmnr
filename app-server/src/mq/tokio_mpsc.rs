use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
};
use dashmap::DashMap;
use std::cmp::Reverse;
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicU64, Ordering},
};
use tokio::sync::{
    Mutex, OwnedSemaphorePermit, Semaphore,
    mpsc::{self, Receiver, Sender, UnboundedReceiver, UnboundedSender},
};

const CHANNEL_CAPACITY: usize = 100;

pub struct TokioMpscReceiver {
    receiver: Receiver<TokioMpscMessage>,
    retry_sender: UnboundedSender<TokioMpscMessage>,
    retry_receiver: UnboundedReceiver<TokioMpscMessage>,
    capacity: Arc<Semaphore>,
    delivery_counter: AtomicU64,
}

pub struct TokioMpscMessage {
    data: Vec<u8>,
    permit: Arc<OwnedSemaphorePermit>,
}

pub struct TokioMpscDelivery {
    message: TokioMpscMessage,
    retry_sender: UnboundedSender<TokioMpscMessage>,
    settlement_claimed: AtomicBool,
    delivery_tag: u64,
}

impl MessageQueueDeliveryTrait for TokioMpscDelivery {
    fn acker(&self) -> MessageQueueAcker {
        if self.settlement_claimed.swap(true, Ordering::AcqRel) {
            return MessageQueueAcker::TokioMpscInvalidAcker;
        }

        MessageQueueAcker::TokioMpscRequeueAcker {
            sender: self.retry_sender.clone(),
            message: TokioMpscMessage {
                data: self.message.data.clone(),
                permit: self.message.permit.clone(),
            },
        }
    }

    fn data(self) -> Vec<u8> {
        self.message.data
    }

    fn delivery_tag(&self) -> u64 {
        self.delivery_tag
    }

    fn retry_attempt(&self) -> u32 {
        0
    }

    /// An mpsc channel has no ordering to influence, so nothing is ever stamped.
    fn priority(&self) -> Option<u8> {
        None
    }
}

impl MessageQueueReceiverTrait for TokioMpscReceiver {
    async fn receive(&mut self) -> Option<anyhow::Result<MessageQueueDelivery>> {
        let payload = if self.receiver.is_closed() {
            self.retry_receiver
                .try_recv()
                .ok()
                .or_else(|| self.receiver.try_recv().ok())
        } else {
            tokio::select! {
                payload = self.retry_receiver.recv() => payload,
                payload = self.receiver.recv() => payload,
            }
        };
        match payload {
            Some(payload) => {
                let delivery_tag = self.delivery_counter.fetch_add(1, Ordering::Relaxed);
                Some(Ok(TokioMpscDelivery {
                    message: payload,
                    retry_sender: self.retry_sender.clone(),
                    settlement_claimed: AtomicBool::new(false),
                    delivery_tag,
                }
                .into()))
            }
            None => None,
        }
    }
}

pub struct TokioMpscQueue {
    senders: DashMap<String, Arc<Mutex<Vec<TokioMpscQueueSender>>>>,
}

struct TokioMpscQueueSender {
    sender: Sender<TokioMpscMessage>,
    capacity: Arc<Semaphore>,
}

impl Drop for TokioMpscReceiver {
    fn drop(&mut self) {
        self.capacity.close();
    }
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

    pub fn register_queue(&self, exchange: &str, routing_key: &str) {
        let key = self.key(exchange, routing_key);
        self.senders.entry(key).or_default();
    }

    /// TTL and priority are both ignored here (local dev only): an mpsc channel
    /// has no expiry and no ordering to influence.
    async fn send(&self, message: &[u8], exchange: &str, routing_key: &str) -> anyhow::Result<()> {
        let key = self.key(exchange, routing_key);

        let Some(senders) = self.senders.get(&key) else {
            return Err(anyhow::anyhow!(
                "Queue mapping for exchange `{}` and routing key `{}` not found",
                exchange,
                routing_key
            ));
        };

        let (sender, capacity) = {
            let senders = senders.lock().await;
            let selected = senders
                .iter()
                .enumerate()
                .filter(|(_, entry)| !entry.sender.is_closed() && !entry.capacity.is_closed())
                .max_by_key(|(index, entry)| (entry.capacity.available_permits(), Reverse(*index)))
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "No active queues exist for exchange `{}` and routing key `{}`",
                        exchange,
                        routing_key
                    )
                })?;
            (selected.1.sender.clone(), selected.1.capacity.clone())
        };

        let permit = capacity
            .acquire_owned()
            .await
            .map_err(|e| anyhow::anyhow!("In-memory queue is closed: {}", e))?;
        sender
            .send(TokioMpscMessage {
                data: message.to_vec(),
                permit: Arc::new(permit),
            })
            .await?;

        Ok(())
    }
}

impl MessageQueueTrait for TokioMpscQueue {
    async fn publish(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        _ttl_ms: Option<u64>,
    ) -> anyhow::Result<()> {
        self.send(message, exchange, routing_key).await
    }

    async fn publish_with_priority(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        _ttl_ms: Option<u64>,
        _priority: u8,
    ) -> anyhow::Result<()> {
        self.send(message, exchange, routing_key).await
    }

    /// Unsupported: the in-memory queue has neither TTL nor dead-lettering, so a
    /// message parked here would be delivered immediately or not at all. Callers
    /// fall back to an immediate requeue on this error.
    async fn publish_retry(
        &self,
        _message: &[u8],
        _exchange: &str,
        _routing_key: &str,
        _ttl_ms: u64,
        _attempt: u32,
        _priority: Option<u8>,
    ) -> anyhow::Result<()> {
        Err(anyhow::anyhow!(
            "In-memory queue cannot delay retries (no TTL, no dead-lettering)"
        ))
    }

    async fn get_receiver(
        &self,
        _queue_name: &str,
        exchange: &str,
        routing_key: &str,
        _prefetch_count: u16,
    ) -> anyhow::Result<MessageQueueReceiver> {
        let key = self.key(exchange, routing_key);

        let (sender, receiver) = mpsc::channel(CHANNEL_CAPACITY);
        let (retry_sender, retry_receiver) = mpsc::unbounded_channel();
        let capacity = Arc::new(Semaphore::new(CHANNEL_CAPACITY));
        let tokio_mpsc_receiver = TokioMpscReceiver {
            receiver,
            retry_sender,
            retry_receiver,
            capacity: capacity.clone(),
            delivery_counter: AtomicU64::new(0),
        };

        self.senders
            .entry(key)
            .or_default()
            .lock()
            .await
            .push(TokioMpscQueueSender { sender, capacity });

        Ok(tokio_mpsc_receiver.into())
    }

    fn is_healthy(&self) -> bool {
        // In-memory queue is always healthy
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{Duration, timeout};

    const EXCHANGE: &str = "test_exchange";
    const ROUTING_KEY: &str = "test_routing_key";

    async fn receiver(queue: &TokioMpscQueue) -> MessageQueueReceiver {
        queue
            .get_receiver("test_queue", EXCHANGE, ROUTING_KEY, 1)
            .await
            .unwrap()
    }

    async fn next_delivery(
        receiver: &mut MessageQueueReceiver,
    ) -> Option<anyhow::Result<MessageQueueDelivery>> {
        timeout(Duration::from_millis(100), receiver.receive())
            .await
            .ok()
            .flatten()
    }

    #[tokio::test]
    async fn reject_true_redelivers_the_same_payload_then_ack_is_terminal() {
        let queue = TokioMpscQueue::new();
        let mut receiver = receiver(&queue).await;
        let payload = b"original wire payload";
        queue
            .publish(payload, EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();

        let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let acker = delivery.acker();
        assert_eq!(delivery.data(), payload);
        acker.reject(true).await.unwrap();

        let redelivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let redelivery_acker = redelivery.acker();
        assert_eq!(redelivery.data(), payload);
        redelivery_acker.ack().await.unwrap();
        assert!(next_delivery(&mut receiver).await.is_none());
    }

    #[tokio::test]
    async fn reject_false_is_terminal() {
        let queue = TokioMpscQueue::new();
        let mut receiver = receiver(&queue).await;
        queue
            .publish(b"payload", EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();

        let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        delivery.acker().reject(false).await.unwrap();
        assert!(next_delivery(&mut receiver).await.is_none());
    }

    #[tokio::test]
    async fn nack_true_redelivers_the_same_payload() {
        let queue = TokioMpscQueue::new();
        let mut receiver = receiver(&queue).await;
        let payload = b"nacked payload";
        queue
            .publish(payload, EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();

        let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let acker = delivery.acker();
        assert_eq!(delivery.data(), payload);
        acker.nack(true).await.unwrap();

        assert_eq!(
            next_delivery(&mut receiver).await.unwrap().unwrap().data(),
            payload
        );
    }

    #[tokio::test]
    async fn a_delivery_can_create_only_one_settlement_acker() {
        let queue = TokioMpscQueue::new();
        let mut receiver = receiver(&queue).await;
        let payload = b"single settlement";
        queue
            .publish(payload, EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();

        let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let acker = delivery.acker();
        let duplicate_acker = delivery.acker();
        assert_eq!(delivery.data(), payload);
        acker.reject(true).await.unwrap();
        assert!(duplicate_acker.reject(true).await.is_err());

        let redelivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let redelivery_acker = redelivery.acker();
        assert_eq!(redelivery.data(), payload);
        redelivery_acker.ack().await.unwrap();
        assert!(next_delivery(&mut receiver).await.is_none());
    }

    #[tokio::test]
    async fn requeue_returns_to_the_originating_receiver() {
        let queue = TokioMpscQueue::new();
        let mut origin = receiver(&queue).await;
        let mut other = receiver(&queue).await;
        queue
            .publish(b"payload", EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();

        let delivery = next_delivery(&mut origin).await.unwrap().unwrap();
        let acker = delivery.acker();
        assert_eq!(delivery.data(), b"payload");
        acker.reject(true).await.unwrap();

        assert_eq!(
            next_delivery(&mut origin).await.unwrap().unwrap().data(),
            b"payload"
        );
        assert!(next_delivery(&mut other).await.is_none());
    }

    #[tokio::test]
    async fn requeue_does_not_wait_for_space_in_a_full_publish_channel() {
        let queue = TokioMpscQueue::new();
        let mut receiver = receiver(&queue).await;
        let payload = b"requeued payload";
        queue
            .publish(payload, EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();
        let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let acker = delivery.acker();
        assert_eq!(delivery.data(), payload);

        for _ in 0..CHANNEL_CAPACITY - 1 {
            queue
                .publish(b"queued payload", EXCHANGE, ROUTING_KEY, None)
                .await
                .unwrap();
        }
        acker.reject(true).await.unwrap();

        let mut redelivered = false;
        for _ in 0..=CHANNEL_CAPACITY {
            let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
            let acker = delivery.acker();
            if delivery.data() == payload {
                redelivered = true;
                acker.ack().await.unwrap();
                break;
            }
        }
        assert!(
            redelivered,
            "requeue should be available despite a full channel"
        );
    }

    #[tokio::test]
    async fn pending_requeues_share_the_publish_capacity_budget() {
        let queue = TokioMpscQueue::new();
        let mut receiver = receiver(&queue).await;
        queue
            .publish(b"retry payload", EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();
        let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let acker = delivery.acker();
        let _ = delivery.data();
        acker.reject(true).await.unwrap();

        for _ in 0..CHANNEL_CAPACITY - 1 {
            queue
                .publish(b"queued payload", EXCHANGE, ROUTING_KEY, None)
                .await
                .unwrap();
        }

        let publish = queue.publish(b"backpressured payload", EXCHANGE, ROUTING_KEY, None);
        tokio::pin!(publish);
        assert!(
            timeout(Duration::from_millis(20), &mut publish)
                .await
                .is_err()
        );

        let settled = next_delivery(&mut receiver).await.unwrap().unwrap();
        let acker = settled.acker();
        let _ = settled.data();
        acker.ack().await.unwrap();
        timeout(Duration::from_secs(1), &mut publish)
            .await
            .expect("publish should resume when a delivery releases capacity")
            .unwrap();
    }

    #[tokio::test]
    async fn closed_publish_channel_drains_pending_requeues_then_ends() {
        let queue = TokioMpscQueue::new();
        let mut receiver = receiver(&queue).await;
        queue
            .publish(b"pending payload", EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();
        let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let acker = delivery.acker();
        queue
            .publish(b"queued payload", EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();
        drop(delivery);
        drop(queue);
        acker.reject(true).await.unwrap();

        assert_eq!(
            receiver.receive().await.unwrap().unwrap().data(),
            b"pending payload"
        );
        assert_eq!(
            receiver.receive().await.unwrap().unwrap().data(),
            b"queued payload"
        );
        assert!(receiver.receive().await.is_none());
    }

    #[tokio::test]
    async fn requeue_after_receiver_drop_returns_an_error() {
        let queue = TokioMpscQueue::new();
        let mut receiver = receiver(&queue).await;
        queue
            .publish(b"orphaned payload", EXCHANGE, ROUTING_KEY, None)
            .await
            .unwrap();
        let delivery = next_delivery(&mut receiver).await.unwrap().unwrap();
        let acker = delivery.acker();
        drop(delivery);
        drop(receiver);

        assert!(acker.reject(true).await.is_err());
    }
}
