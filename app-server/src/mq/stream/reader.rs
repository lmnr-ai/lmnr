//! Super-stream reader: partition read tasks → partition-affine batchers.
//!
//! ```text
//!   SuperStreamConsumer (single active consumer, one group)
//!            │  chunked deliveries, one subscription per active partition
//!            ▼
//!   fan-out by partition_index % batchers        (bounded mpsc = backpressure)
//!            ▼
//!   N batcher tasks — accumulate, flush, THEN store offset per partition
//! ```
//!
//! Two invariants make this correct:
//!
//! 1. **Partition affinity.** A partition's deliveries always land in the same
//!    batcher, so its offset advances monotonically. Round-robin fan-out would
//!    let batcher A store partition P's offset past records still unflushed in
//!    batcher B — silent data loss.
//! 2. **Flush before offset.** `store_offset` runs only after the handler's
//!    flush succeeds — the streams analogue of flush-then-ack. A crash in
//!    between replays a few records (at-least-once, same as the queue path's
//!    redelivery); storing first would drop them.
//!
//! Retry is *in place*: a transient flush failure keeps the offset put and
//! retries with backoff. There is no requeue because the record never left the
//! log. Head-of-line blocking on that partition is the deliberate trade — the
//! backlog accumulates on broker disk, which is the point of the migration.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use futures_util::StreamExt;
use rabbitmq_stream_client::{
    Client, NoDedup, Producer,
    types::{Message, OffsetSpecification},
};
use serde::de::DeserializeOwned;
use tokio::sync::mpsc;
use uuid::Uuid;

use super::topology::StreamEnvironment;
use crate::env;
use crate::worker::HandlerError;

/// One record off a partition, decoded.
pub struct StreamDelivery<M> {
    pub message: M,
    pub stream: String,
    pub offset: u64,
}

/// Batch sink for a stream reader. Mirrors `BatchMessageHandler`'s
/// accumulate-then-flush contract, minus the ack bookkeeping (offsets are the
/// reader's job).
#[async_trait]
pub trait StreamBatchHandler: Send + Sync + 'static {
    type Message: DeserializeOwned + Send + Sync + 'static;

    /// Flush interval. The reader also flushes on `batch_size`.
    fn interval(&self) -> Duration;

    /// Records to accumulate before flushing. Keep per-flush BYTES comparable to
    /// the queue path: a stream consumer sees only `1/partitions` of the traffic,
    /// so a size tuned for one shared queue produces far smaller ClickHouse
    /// inserts here — more parts/sec on the hot tables, which is the opposite of
    /// what we want.
    fn batch_size(&self) -> usize;

    /// Process one accumulated batch. `Transient` is retried in place (the batch
    /// is borrowed, so a retry costs nothing); `Permanent` skips the batch and
    /// lets the offset advance past it.
    async fn flush(&self, messages: &[Self::Message]) -> Result<(), HandlerError>;
}

/// Reads one super stream into a handler. Spawn with [`StreamReader::run`].
pub struct StreamReader<H: StreamBatchHandler> {
    id: Uuid,
    super_stream: &'static str,
    consumer_name: &'static str,
    environment: StreamEnvironment,
    handler: Arc<H>,
    dead_letter: Option<Arc<DeadLetterSink>>,
}

impl<H: StreamBatchHandler> StreamReader<H> {
    pub fn new(
        super_stream: &'static str,
        consumer_name: &'static str,
        environment: StreamEnvironment,
        handler: H,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            super_stream,
            consumer_name,
            environment,
            handler: Arc::new(handler),
            dead_letter: None,
        }
    }

    /// Route permanently-failing batches here before skipping them. Streams have
    /// no DLX and a record can't be deleted, so poison handling is
    /// publish-elsewhere-then-advance.
    pub fn with_dead_letter(mut self, sink: Arc<DeadLetterSink>) -> Self {
        self.dead_letter = Some(sink);
        self
    }

    /// Runs forever, reconnecting on stream end / connection loss.
    pub async fn run(self) {
        loop {
            if let Err(e) = self.run_once().await {
                log::error!(
                    "Stream reader {} ({}) failed: {:?}, reconnecting...",
                    self.id,
                    self.super_stream,
                    e
                );
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    async fn run_once(&self) -> anyhow::Result<()> {
        let num_batchers = env::streams::BATCHERS.get().max(1);
        let capacity = env::streams::CHANNEL_CAPACITY.get().max(1);

        // Offsets are stored through the raw client rather than the consumer
        // handle: `SuperStreamConsumer` multiplexes every partition into one
        // delivery stream, so the (reference, partition stream) pair has to be
        // named explicitly per store.
        let mut consumer = self
            .environment
            .inner()
            .super_stream_consumer()
            .name(self.consumer_name)
            // Resume where the group left off. `First` only applies to a group
            // that has never stored an offset — for an established group the
            // broker hands back the stored one, and `consumer_update` below
            // re-resolves it on every single-active-consumer handover.
            .offset(OffsetSpecification::First)
            .enable_single_active_consumer(true)
            .client_provided_name(&format!("lmnr-{}-{}", self.super_stream, self.id))
            .consumer_update(move |active, context| async move {
                let stream = context.stream();
                // `active` is the wire-level flag (0 = deactivated), not a bool.
                if active == 0 {
                    // Deactivated: the successor resumes from the last stored
                    // offset. Our own batcher may still hold unflushed records
                    // for this partition, which the successor will replay —
                    // at-least-once, consistent with the queue path.
                    log::info!("Stream partition {} deactivated for this consumer", stream);
                    return OffsetSpecification::Next;
                }
                match context.client().query_offset(context.name(), &stream).await {
                    Ok(offset) => {
                        log::info!(
                            "Stream partition {} activated, resuming at offset {}",
                            stream,
                            offset
                        );
                        // Stored offset is the last PROCESSED record, so resume
                        // one past it.
                        OffsetSpecification::Offset(offset + 1)
                    }
                    Err(_) => {
                        log::info!(
                            "Stream partition {} activated with no stored offset, starting from first",
                            stream
                        );
                        OffsetSpecification::First
                    }
                }
            })
            .build(self.super_stream)
            .await?;

        let client = consumer.client();

        let mut senders = Vec::with_capacity(num_batchers);
        let mut batcher_handles = Vec::with_capacity(num_batchers);
        for index in 0..num_batchers {
            let (tx, rx) = mpsc::channel::<StreamDelivery<H::Message>>(capacity);
            senders.push(tx);
            batcher_handles.push(tokio::spawn(run_batcher(
                index,
                rx,
                self.handler.clone(),
                client.clone(),
                self.consumer_name,
                self.dead_letter.clone(),
            )));
        }

        log::info!(
            "Stream reader {} ({}) connected with {} batchers",
            self.id,
            self.super_stream,
            num_batchers
        );

        let mut assignment = BatcherAssignment::default();

        while let Some(delivery) = consumer.next().await {
            let delivery = delivery?;
            let stream = delivery.stream().clone();
            let offset = delivery.offset();

            let Some(data) = delivery.message().data() else {
                log::warn!("Empty stream record at {}:{}, skipping", stream, offset);
                continue;
            };

            let message = match serde_json::from_slice::<H::Message>(data) {
                Ok(message) => message,
                Err(e) => {
                    // Won't parse on retry either. Skipping leaves the offset to
                    // advance with the next successful batch from this partition.
                    log::error!(
                        "Failed to deserialize stream record at {}:{}: {:?}",
                        stream,
                        offset,
                        e
                    );
                    continue;
                }
            };

            let batcher = assignment.resolve(&stream, num_batchers);

            // Bounded send: when the batcher is behind this awaits, which stops
            // us draining the consumer and lets credit-based flow control park
            // the backlog on the broker.
            if senders[batcher]
                .send(StreamDelivery {
                    message,
                    stream,
                    offset,
                })
                .await
                .is_err()
            {
                log::error!("Stream batcher {} died, reconnecting reader", batcher);
                break;
            }
        }

        drop(senders);
        for handle in batcher_handles {
            let _ = handle.await;
        }

        Ok(())
    }
}

/// Stable partition→batcher map. Assignment is by first-sight order rather than
/// parsing the `-N` suffix off the partition name: the suffix is a client-side
/// naming convention, and an unparseable name would silently collapse every
/// partition onto batcher 0. What matters is only that a given partition always
/// resolves to the same batcher for the life of the connection.
#[derive(Default)]
struct BatcherAssignment {
    assigned: HashMap<String, usize>,
}

impl BatcherAssignment {
    fn resolve(&mut self, stream: &str, num_batchers: usize) -> usize {
        let next = self.assigned.len() % num_batchers;
        *self.assigned.entry(stream.to_string()).or_insert(next)
    }
}

/// Highest offset seen per partition in the current batch. Storing the max (not
/// the last) is what makes a store safe: records within a partition arrive in
/// offset order, so the max is the last one this flush covers.
#[derive(Default)]
struct PendingOffsets {
    offsets: HashMap<String, u64>,
}

impl PendingOffsets {
    fn record(&mut self, stream: String, offset: u64) {
        self.offsets
            .entry(stream)
            .and_modify(|current| *current = (*current).max(offset))
            .or_insert(offset);
    }

    fn take(&mut self) -> HashMap<String, u64> {
        std::mem::take(&mut self.offsets)
    }
}

/// Accumulate → flush → store offsets, for the partitions assigned to us.
async fn run_batcher<H: StreamBatchHandler>(
    index: usize,
    mut rx: mpsc::Receiver<StreamDelivery<H::Message>>,
    handler: Arc<H>,
    client: Client,
    consumer_name: &'static str,
    dead_letter: Option<Arc<DeadLetterSink>>,
) {
    let mut batch: Vec<H::Message> = Vec::new();
    let mut pending_offsets = PendingOffsets::default();
    let mut ticker = tokio::time::interval(handler.interval());
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        let batch_size = handler.batch_size();
        tokio::select! {
            received = rx.recv() => {
                match received {
                    Some(delivery) => {
                        pending_offsets.record(delivery.stream, delivery.offset);
                        batch.push(delivery.message);

                        if batch.len() >= batch_size {
                            flush_and_commit(
                                index,
                                &handler,
                                &client,
                                consumer_name,
                                &mut batch,
                                &mut pending_offsets,
                                dead_letter.as_deref(),
                            )
                            .await;
                        }
                    }
                    None => {
                        // Reader is gone: flush what we hold so the offsets for
                        // already-processed records are durable, then exit.
                        if !batch.is_empty() {
                            flush_and_commit(
                                index,
                                &handler,
                                &client,
                                consumer_name,
                                &mut batch,
                                &mut pending_offsets,
                                dead_letter.as_deref(),
                            )
                            .await;
                        }
                        return;
                    }
                }
            }
            _ = ticker.tick() => {
                if !batch.is_empty() {
                    flush_and_commit(
                        index,
                        &handler,
                        &client,
                        consumer_name,
                        &mut batch,
                        &mut pending_offsets,
                        dead_letter.as_deref(),
                    )
                    .await;
                }
            }
        }
    }
}

/// Flush with in-place retry, then store one offset per partition in the batch.
///
/// Retries `Transient` failures with bounded backoff. If the budget is exhausted
/// the batch is dropped and offsets still advance — otherwise a permanently
/// unflushable batch wedges the partition until retention deletes it, and the
/// records behind it are lost anyway. `Permanent` failures dead-letter first.
async fn flush_and_commit<H: StreamBatchHandler>(
    index: usize,
    handler: &Arc<H>,
    client: &Client,
    consumer_name: &'static str,
    batch: &mut Vec<H::Message>,
    pending_offsets: &mut PendingOffsets,
    dead_letter: Option<&DeadLetterSink>,
) {
    let messages = std::mem::take(batch);
    let offsets = pending_offsets.take();
    if messages.is_empty() {
        return;
    }

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_millis(200))
        .with_max_interval(Duration::from_secs(10))
        .with_max_elapsed_time(Some(Duration::from_secs(300)))
        .build();

    let outcome = backoff::future::retry(backoff, || {
        let handler = handler.clone();
        let messages = &messages;
        async move {
            match handler.flush(messages).await {
                Ok(()) => Ok(()),
                Err(HandlerError::Transient(e)) => {
                    log::warn!("Stream batcher {} flush failed transiently: {}", index, e);
                    Err(backoff::Error::transient(e))
                }
                Err(HandlerError::Permanent(e)) => {
                    log::error!("Stream batcher {} flush failed permanently: {}", index, e);
                    Err(backoff::Error::permanent(e))
                }
            }
        }
    })
    .await;

    if let Err(e) = outcome {
        // Either a permanent failure or an exhausted retry budget. Offsets still
        // advance below: a batch that can never flush would otherwise wedge its
        // partitions until retention deleted the records anyway.
        log::error!(
            "Stream batcher {} dropping {} records across {} partitions: {}",
            index,
            messages.len(),
            offsets.len(),
            e
        );
        if let Some(sink) = dead_letter {
            sink.publish_failure(&e.to_string()).await;
        }
    }

    for (stream, offset) in offsets {
        if let Err(e) = client.store_offset(consumer_name, &stream, offset).await {
            // Best-effort: a lost store just replays those records after a
            // restart. Never fail the batch over it.
            log::warn!(
                "Failed to store offset {} for stream {}: {:?}",
                offset,
                stream,
                e
            );
        }
    }
}

/// Poison-record sink. Streams have no dead-letter exchange and a record can't be
/// deleted, so failures are recorded on a dedicated stream and the reader
/// advances past them.
pub struct DeadLetterSink {
    producer: Producer<NoDedup>,
}

impl DeadLetterSink {
    pub async fn new(environment: &StreamEnvironment, stream: &str) -> anyhow::Result<Self> {
        let producer = environment.inner().producer().build(stream).await?;
        Ok(Self { producer })
    }

    async fn publish_failure(&self, reason: &str) {
        let message = Message::builder().body(reason.as_bytes().to_vec()).build();
        if let Err(e) = self.producer.send_with_confirm(message).await {
            log::error!("Failed to record stream flush failure: {:?}", e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assignment_is_stable_per_partition() {
        let mut assignment = BatcherAssignment::default();

        let first = assignment.resolve("observations_stream-3", 4);
        // Same partition must always resolve to the same batcher — this is what
        // keeps a partition's offsets advancing from one place.
        for _ in 0..10 {
            assert_eq!(assignment.resolve("observations_stream-3", 4), first);
        }
    }

    #[test]
    fn assignment_spreads_partitions_across_batchers() {
        let mut assignment = BatcherAssignment::default();
        let batchers = 4;

        let resolved: Vec<usize> = (0..8)
            .map(|i| assignment.resolve(&format!("observations_stream-{}", i), batchers))
            .collect();

        assert_eq!(resolved, vec![0, 1, 2, 3, 0, 1, 2, 3]);
    }

    #[test]
    fn assignment_handles_unparseable_partition_names() {
        // Assignment must not depend on the `-N` suffix: a naming change would
        // otherwise collapse every partition onto one batcher.
        let mut assignment = BatcherAssignment::default();
        assert_eq!(assignment.resolve("weird-name", 2), 0);
        assert_eq!(assignment.resolve("another-name", 2), 1);
        assert_eq!(assignment.resolve("weird-name", 2), 0);
    }

    #[test]
    fn pending_offsets_keep_the_max_per_partition() {
        let mut offsets = PendingOffsets::default();
        offsets.record("p-0".to_string(), 10);
        offsets.record("p-0".to_string(), 42);
        // Out-of-order record must not lower the stored offset, or the records
        // between 12 and 42 would be replayed after a restart.
        offsets.record("p-0".to_string(), 12);
        offsets.record("p-1".to_string(), 7);

        let taken = offsets.take();
        assert_eq!(taken.get("p-0"), Some(&42));
        assert_eq!(taken.get("p-1"), Some(&7));
    }

    #[test]
    fn pending_offsets_reset_after_take() {
        let mut offsets = PendingOffsets::default();
        offsets.record("p-0".to_string(), 1);
        assert_eq!(offsets.take().len(), 1);
        // A second flush must not re-store the previous batch's offsets.
        assert!(offsets.take().is_empty());
    }
}
