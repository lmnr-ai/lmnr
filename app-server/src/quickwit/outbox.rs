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
    tx: Sender<IndexerQueuePayload>,
    dropped_overflow: AtomicU64,
    dropped_oversize: AtomicU64,
}

impl IndexerOutbox {
    pub fn spawn(queue: Arc<MessageQueue>) -> Arc<Self> {
        let capacity = *OUTBOX_CAPACITY;
        let concurrency = *OUTBOX_SHIPPER_CONCURRENCY;
        let (tx, rx) = mpsc::channel::<IndexerQueuePayload>(capacity);

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

    /// Hand a payload to the outbox. Never awaits broker I/O. Drops the
    /// payload (with a counter increment) when the channel is full or the
    /// receiver is gone.
    pub fn try_send(&self, payload: IndexerQueuePayload) {
        if let Some(reason) = oversize_reason(&payload) {
            self.dropped_oversize.fetch_add(1, Ordering::Relaxed);
            log::warn!("Quickwit indexer payload dropped at outbox: {}", reason);
            return;
        }

        match self.tx.try_send(payload) {
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

fn oversize_reason(payload: &IndexerQueuePayload) -> Option<String> {
    let max_payload = mq_max_payload();
    let serialized_len = match serde_json::to_vec(payload) {
        Ok(v) => v.len(),
        Err(e) => return Some(format!("serialize failed: {}", e)),
    };
    if serialized_len >= max_payload {
        return Some(format!(
            "payload {} bytes exceeds MQ limit {}",
            serialized_len, max_payload
        ));
    }
    None
}

async fn dispatcher_loop(
    mut rx: mpsc::Receiver<IndexerQueuePayload>,
    queue: Arc<MessageQueue>,
    semaphore: Arc<Semaphore>,
) {
    log::info!("Quickwit indexer outbox dispatcher started");
    while let Some(payload) = rx.recv().await {
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
            ship_one(payload, queue).await;
        });
    }
    log::info!("Quickwit indexer outbox dispatcher shutting down (channel closed)");
}

async fn ship_one(payload: IndexerQueuePayload, queue: Arc<MessageQueue>) {
    let serialized = match serde_json::to_vec(&payload) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("Quickwit indexer payload serialize failed: {:?}", e);
            return;
        }
    };

    if let Err(e) = queue
        .publish(
            &serialized,
            SPANS_INDEXER_EXCHANGE,
            SPANS_INDEXER_ROUTING_KEY,
            None,
        )
        .await
    {
        log::warn!("Quickwit indexer publish failed: {:?}", e);
    }
}
