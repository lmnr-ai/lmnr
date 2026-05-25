use std::sync::{
    Arc, LazyLock,
    atomic::{AtomicU64, Ordering},
};

use tokio::sync::{
    Semaphore,
    mpsc::{self, Sender, error::TrySendError},
};

use crate::{
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    quickwit::{IndexerQueuePayload, SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_ROUTING_KEY},
};

static OUTBOX_CAPACITY: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("QUICKWIT_OUTBOX_CAPACITY")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|&v| v > 0)
        .unwrap_or(2048)
});

static OUTBOX_SHIPPER_CONCURRENCY: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("QUICKWIT_OUTBOX_SHIPPERS")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|&v| v > 0)
        .unwrap_or(4)
});

/// Bounded mpsc outbox for Quickwit indexer payloads. The consumer hot path
/// in `process_span_messages` no longer awaits the broker publish — it hands
/// the payload to this outbox and returns. A dispatcher task drains the
/// channel and fans each payload out to a `Semaphore`-bounded `tokio::spawn`
/// that calls `MessageQueue::publish`. When the channel is full (broker stuck
/// under flow control), `try_send` drops the payload so the consumer keeps
/// acking deliveries and the queue keeps draining.
///
/// Indexer payloads are reproducible from ClickHouse, so drop-on-overflow is
/// the correct failure mode here. Do NOT route the primary observations
/// publish through this outbox — that path must apply back-pressure, not drop.
pub struct IndexerOutbox {
    tx: Sender<Vec<u8>>,
    dropped_overflow: AtomicU64,
    dropped_oversize: AtomicU64,
}

impl IndexerOutbox {
    pub fn spawn(queue: Arc<MessageQueue>) -> Arc<Self> {
        let capacity = *OUTBOX_CAPACITY;
        let concurrency = *OUTBOX_SHIPPER_CONCURRENCY;
        let (tx, rx) = mpsc::channel::<Vec<u8>>(capacity);

        let outbox = Arc::new(Self {
            tx,
            dropped_overflow: AtomicU64::new(0),
            dropped_oversize: AtomicU64::new(0),
        });

        let semaphore = Arc::new(Semaphore::new(concurrency));
        tokio::spawn(dispatcher_loop(rx, queue, semaphore));

        log::info!(
            "Quickwit indexer outbox started: capacity={}, concurrency={}",
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
    pub fn try_send(&self, payload: IndexerQueuePayload) {
        let bytes = match serde_json::to_vec(&payload) {
            Ok(v) => v,
            Err(e) => {
                self.dropped_oversize.fetch_add(1, Ordering::Relaxed);
                log::warn!("Quickwit indexer payload serialize failed: {:?}", e);
                return;
            }
        };
        let max_payload = mq_max_payload();
        if bytes.len() >= max_payload {
            self.dropped_oversize.fetch_add(1, Ordering::Relaxed);
            log::warn!(
                "Quickwit indexer payload dropped at outbox: {} bytes exceeds MQ limit {}",
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
                        "Quickwit indexer outbox full — dropped {} payloads since boot",
                        n
                    );
                }
            }
            Err(TrySendError::Closed(_)) => {
                log::error!("Quickwit indexer outbox closed — payload dropped");
            }
        }
    }
}

async fn dispatcher_loop(
    mut rx: mpsc::Receiver<Vec<u8>>,
    queue: Arc<MessageQueue>,
    semaphore: Arc<Semaphore>,
) {
    log::info!("Quickwit indexer outbox dispatcher started");
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
            ship_one(bytes, queue).await;
        });
    }
    log::info!("Quickwit indexer outbox dispatcher shutting down (channel closed)");
}

async fn ship_one(bytes: Vec<u8>, queue: Arc<MessageQueue>) {
    if let Err(e) = queue
        .publish(
            &bytes,
            SPANS_INDEXER_EXCHANGE,
            SPANS_INDEXER_ROUTING_KEY,
            None,
        )
        .await
    {
        log::warn!("Quickwit indexer publish failed: {:?}", e);
    }
}
