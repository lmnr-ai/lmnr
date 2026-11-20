//! Test-only transport that records what a worker did with its deliveries:
//! which messages it parked for a delayed retry, and how it settled each one.
//! The in-memory queue can't stand in here because it refuses `publish_retry`
//! and its acker is a no-op.

use std::sync::{Arc, Mutex};

use super::{MessageQueueAcker, MessageQueueReceiver, MessageQueueTrait};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordedRetry {
    pub message: Vec<u8>,
    pub exchange: String,
    pub routing_key: String,
    pub ttl_ms: u64,
    pub attempt: u32,
    pub priority: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Settlement {
    Ack,
    Nack { requeue: bool },
    Reject { requeue: bool },
}

#[derive(Default)]
pub struct RecordingQueue {
    pub retries: Mutex<Vec<RecordedRetry>>,
    /// Make `publish_retry` fail, as it does when the broker is the thing down.
    pub fail_retries: bool,
}

impl RecordingQueue {
    pub fn failing_retries() -> Self {
        Self {
            fail_retries: true,
            ..Default::default()
        }
    }

    pub fn retries(&self) -> Vec<RecordedRetry> {
        self.retries.lock().unwrap().clone()
    }
}

/// Settlements by delivery tag, shared by every acker handed out for one test.
#[derive(Clone, Default)]
pub struct SettlementLog(Arc<Mutex<Vec<(u64, Settlement)>>>);

impl SettlementLog {
    pub fn acker(&self, delivery_tag: u64) -> MessageQueueAcker {
        MessageQueueAcker::Recording {
            delivery_tag,
            log: self.clone(),
        }
    }

    pub fn record(&self, delivery_tag: u64, settlement: Settlement) {
        self.0.lock().unwrap().push((delivery_tag, settlement));
    }

    /// Sorted by tag, since a worker settles a batch concurrently.
    pub fn settlements(&self) -> Vec<(u64, Settlement)> {
        let mut settlements = self.0.lock().unwrap().clone();
        settlements.sort_by_key(|(tag, _)| *tag);
        settlements
    }
}

impl MessageQueueTrait for RecordingQueue {
    async fn publish(
        &self,
        _message: &[u8],
        _exchange: &str,
        _routing_key: &str,
        _ttl_ms: Option<u64>,
    ) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("RecordingQueue only records retries"))
    }

    async fn publish_with_priority(
        &self,
        _message: &[u8],
        _exchange: &str,
        _routing_key: &str,
        _ttl_ms: Option<u64>,
        _priority: u8,
    ) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("RecordingQueue only records retries"))
    }

    async fn publish_retry(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: u64,
        attempt: u32,
        priority: Option<u8>,
    ) -> anyhow::Result<()> {
        if self.fail_retries {
            return Err(anyhow::anyhow!("retry exchange unreachable"));
        }
        self.retries.lock().unwrap().push(RecordedRetry {
            message: message.to_vec(),
            exchange: exchange.to_string(),
            routing_key: routing_key.to_string(),
            ttl_ms,
            attempt,
            priority,
        });
        Ok(())
    }

    async fn get_receiver(
        &self,
        _queue_name: &str,
        _exchange: &str,
        _routing_key: &str,
        _prefetch_count: u16,
    ) -> anyhow::Result<MessageQueueReceiver> {
        Err(anyhow::anyhow!("RecordingQueue has no consumers"))
    }

    fn is_healthy(&self) -> bool {
        true
    }
}
