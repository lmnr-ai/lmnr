use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use serde::Serialize;
use tokio::sync::{
    Semaphore,
    mpsc::{self, Sender, error::TrySendError},
};

use crate::mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload};

/// Configuration for an `Outbox`. Each instance is bound at construction to a
/// single (exchange, routing_key) destination and tunes its own bounded
/// channel + shipper-concurrency budget.
///
/// `name` shows up in log lines and is the env-var prefix used to override
/// `capacity` and `shipper_concurrency` at runtime — e.g. with `name = "indexer"`
/// the overrides are `INDEXER_OUTBOX_CAPACITY` and `INDEXER_OUTBOX_SHIPPERS`.
pub struct OutboxConfig {
    pub name: &'static str,
    pub exchange: &'static str,
    pub routing_key: &'static str,
    pub default_capacity: usize,
    pub default_shipper_concurrency: usize,
}

/// Bounded mpsc outbox that decouples a producer (e.g. consumer hot path)
/// from broker publishes. The producer calls `try_send`, which serializes
/// once and hands the bytes to a bounded channel. A dispatcher task drains
/// the channel and fans each payload out to a `Semaphore`-bounded
/// `tokio::spawn` that calls `MessageQueue::publish`. When the channel is
/// full (broker stuck under flow control), `try_send` drops the payload so
/// the producer keeps making progress.
///
/// Use this for **reproducible / non-essential** publishes. Do NOT route
/// payloads that must not be lost through here — drop-on-overflow is the
/// whole point.
pub struct Outbox<T: Serialize + Send + 'static> {
    name: &'static str,
    tx: Sender<Vec<u8>>,
    dropped_overflow: AtomicU64,
    dropped_oversize: AtomicU64,
    _marker: std::marker::PhantomData<fn(T)>,
}

impl<T: Serialize + Send + 'static> Outbox<T> {
    pub fn spawn(queue: Arc<MessageQueue>, config: OutboxConfig) -> Arc<Self> {
        let capacity = env_override(config.name, "CAPACITY", config.default_capacity);
        let concurrency =
            env_override(config.name, "SHIPPERS", config.default_shipper_concurrency);
        let (tx, rx) = mpsc::channel::<Vec<u8>>(capacity);

        let outbox = Arc::new(Self {
            name: config.name,
            tx,
            dropped_overflow: AtomicU64::new(0),
            dropped_oversize: AtomicU64::new(0),
            _marker: std::marker::PhantomData,
        });

        let semaphore = Arc::new(Semaphore::new(concurrency));
        tokio::spawn(dispatcher_loop(
            config.name,
            config.exchange,
            config.routing_key,
            rx,
            queue,
            semaphore,
        ));

        log::info!(
            "Outbox '{}' started: exchange={}, routing_key={}, capacity={}, concurrency={}",
            config.name,
            config.exchange,
            config.routing_key,
            capacity,
            concurrency,
        );

        outbox
    }

    /// Number of payloads dropped because the bounded channel was full.
    /// Read-only accessor for metrics scrapers.
    #[allow(dead_code)]
    pub fn dropped_overflow(&self) -> u64 {
        self.dropped_overflow.load(Ordering::Relaxed)
    }

    /// Number of payloads dropped because they exceeded the MQ payload limit
    /// or failed to serialize. Read-only accessor for metrics scrapers.
    #[allow(dead_code)]
    pub fn dropped_oversize(&self) -> u64 {
        self.dropped_oversize.load(Ordering::Relaxed)
    }

    /// Hand a payload to the outbox. Never awaits broker I/O. Serializes
    /// once and drops on size limit, full channel, or closed receiver.
    pub fn try_send(&self, payload: T) {
        let bytes = match serde_json::to_vec(&payload) {
            Ok(v) => v,
            Err(e) => {
                self.dropped_oversize.fetch_add(1, Ordering::Relaxed);
                log::warn!("Outbox '{}' serialize failed: {:?}", self.name, e);
                return;
            }
        };
        let max_payload = mq_max_payload();
        if bytes.len() >= max_payload {
            self.dropped_oversize.fetch_add(1, Ordering::Relaxed);
            log::warn!(
                "Outbox '{}' payload dropped: {} bytes exceeds MQ limit {}",
                self.name,
                bytes.len(),
                max_payload,
            );
            return;
        }

        match self.tx.try_send(bytes) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                let n = self.dropped_overflow.fetch_add(1, Ordering::Relaxed) + 1;
                if n.is_power_of_two() {
                    log::warn!(
                        "Outbox '{}' full — dropped {} payloads since boot",
                        self.name,
                        n
                    );
                }
            }
            Err(TrySendError::Closed(_)) => {
                log::error!("Outbox '{}' closed — payload dropped", self.name);
            }
        }
    }
}

fn env_override(name: &str, suffix: &str, default: usize) -> usize {
    let key = format!("{}_OUTBOX_{}", name.to_uppercase(), suffix);
    std::env::var(&key)
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|&v| v > 0)
        .unwrap_or(default)
}

async fn dispatcher_loop(
    name: &'static str,
    exchange: &'static str,
    routing_key: &'static str,
    mut rx: mpsc::Receiver<Vec<u8>>,
    queue: Arc<MessageQueue>,
    semaphore: Arc<Semaphore>,
) {
    log::info!("Outbox '{}' dispatcher started", name);
    while let Some(bytes) = rx.recv().await {
        // Bound concurrent publishes. Acquiring blocks the dispatcher when
        // every shipper slot is busy, which feeds back-pressure to the bounded
        // channel — extra payloads queue up there until try_send drops them.
        let permit = match semaphore.clone().acquire_owned().await {
            Ok(p) => p,
            Err(_) => return,
        };
        let queue = queue.clone();
        tokio::spawn(async move {
            let _permit = permit;
            ship_one(name, exchange, routing_key, bytes, queue).await;
        });
    }
    log::info!("Outbox '{}' dispatcher shutting down (channel closed)", name);
}

async fn ship_one(
    name: &'static str,
    exchange: &'static str,
    routing_key: &'static str,
    bytes: Vec<u8>,
    queue: Arc<MessageQueue>,
) {
    if let Err(e) = queue.publish(&bytes, exchange, routing_key, None).await {
        log::warn!("Outbox '{}' publish failed: {:?}", name, e);
    }
}
