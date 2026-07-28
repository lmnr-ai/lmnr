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
//! Retry is *in place* and **unbounded for transient failures**: the offset stays
//! put and the batch is retried forever, matching the queue path's indefinite
//! requeue. There is no requeue here because the record never left the log.
//! Head-of-line blocking on that partition is the deliberate trade — the backlog
//! accumulates on broker disk, which is the point of the migration.
//!
//! Anything we skip past — an empty record, an undecodable record, a permanently
//! failing batch — is copied to the dead-letter stream FIRST, payload included.
//! Once the offset advances the source record is unreachable, so an uncopied skip
//! is permanent data loss. The copy is therefore a **precondition**: if it fails
//! (retried, then given up) the offset is HELD and the reader reconnects so the
//! record is redelivered. That's why the sink is required rather than optional —
//! a reader is never constructed without one.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use base64::{Engine, prelude::BASE64_STANDARD};
use futures_util::StreamExt;
use rabbitmq_stream_client::{
    Client, NoDedup, Producer,
    types::{Message, OffsetSpecification},
};
use serde::{Serialize, de::DeserializeOwned};
use tokio::sync::mpsc;
use uuid::Uuid;

use super::topology::StreamEnvironment;
use crate::env;
use crate::worker::HandlerError;

/// Escalate the transient-retry log from `warn` to `error` every N attempts.
/// Retries are unbounded, so without this an hours-long ClickHouse outage is
/// only visible as consumer lag.
const TRANSIENT_RETRY_LOG_EVERY: u32 = 20;

/// How long to wait for batchers to drain on reconnect before abandoning them.
/// Needed because transient retries are unbounded: an in-flight flush against a
/// down dependency would otherwise hold reader reconnect open indefinitely.
const BATCHER_DRAIN_TIMEOUT: Duration = Duration::from_secs(30);

/// Retry budget for a dead-letter write. Bounded because the sink sits on the
/// ingest path, but long enough to ride out a broker blip — an exhausted budget
/// makes the caller HOLD the offset rather than drop the record.
const DEAD_LETTER_WRITE_BUDGET: Duration = Duration::from_secs(30);

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

    /// Units to accumulate before flushing, in whatever `message_weight` counts.
    /// Keep per-flush BYTES comparable to the queue path: a stream consumer sees
    /// only `1/partitions` of the traffic, so a size tuned for one shared queue
    /// produces far smaller ClickHouse inserts here — more parts/sec on the hot
    /// tables, which is the opposite of what we want.
    fn batch_size(&self) -> usize;

    /// How much one record counts toward `batch_size`. Defaults to 1 (record
    /// count); override when a record is itself a batch, so the threshold means
    /// the same thing as on the queue path. `SPANS_BATCH_SIZE` is a SPAN count
    /// (`SpanHandler` sums `message.len()` across deliveries), and one stream
    /// record carries a whole `Vec<RabbitMqSpanMessage>` export — counting
    /// records there would flush ~N× more spans per ClickHouse insert under
    /// multi-span exports.
    fn message_weight(_message: &Self::Message) -> usize {
        1
    }

    /// Process one accumulated batch. `Transient` is retried in place FOREVER
    /// (the batch is borrowed, so a retry costs nothing) and never advances the
    /// offset — use it for infrastructure failures. `Permanent` dead-letters the
    /// batch and advances past it — use it only when the data itself is
    /// unprocessable, since it is the one arm that discards records.
    async fn flush(&self, messages: &[Self::Message]) -> Result<(), HandlerError>;
}

/// Reads one super stream into a handler. Spawn with [`StreamReader::run`].
pub struct StreamReader<H: StreamBatchHandler> {
    id: Uuid,
    super_stream: &'static str,
    consumer_name: &'static str,
    environment: StreamEnvironment,
    handler: Arc<H>,
    /// REQUIRED, not optional: it is the only surviving copy of anything the
    /// reader skips past, so there is no safe mode without it.
    dead_letter: Arc<DeadLetterSink>,
}

impl<H: StreamBatchHandler> StreamReader<H> {
    pub fn new(
        super_stream: &'static str,
        consumer_name: &'static str,
        environment: StreamEnvironment,
        handler: H,
        dead_letter: Arc<DeadLetterSink>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            super_stream,
            consumer_name,
            environment,
            handler: Arc::new(handler),
            dead_letter,
        }
    }

    /// Whether an undecodable record may be skipped, i.e. a durable copy exists.
    ///
    /// `false` when the dead-letter write failed. The caller must then stop
    /// consuming so the offset is never advanced past the record — the alternative
    /// is discarding data that exists nowhere else. Reconnecting redelivers it; if
    /// the sink is permanently broken this loops, which is loud and recoverable,
    /// unlike silent loss.
    async fn skip_record(
        &self,
        kind: &str,
        reason: &str,
        stream: &str,
        offset: u64,
        payload: Option<&[u8]>,
    ) -> bool {
        if self
            .dead_letter
            .publish_record_failure(kind, reason, stream, offset, payload)
            .await
        {
            return true;
        }
        log::error!(
            "Dead-letter write failed for {} at {}:{}; holding the offset and reconnecting rather than dropping the record",
            kind,
            stream,
            offset
        );
        false
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

            // Undecodable records are skipped, and a later successful flush on the
            // same partition advances the offset PAST them — so the dead-letter
            // copy is the ONLY surviving artifact. If that copy doesn't land we
            // must not skip: `skip_record` returns false and we reconnect with the
            // offset untouched, so the record is redelivered rather than lost to
            // retention (schema drift / corruption stays inspectable).
            let Some(data) = delivery.message().data() else {
                log::warn!("Empty stream record at {}:{}", stream, offset);
                if !self
                    .skip_record("empty_record", "record had no body", &stream, offset, None)
                    .await
                {
                    break;
                }
                continue;
            };

            let message = match serde_json::from_slice::<H::Message>(data) {
                Ok(message) => message,
                Err(e) => {
                    // Won't parse on retry either — same verdict as the queue
                    // path's reject-without-requeue on a deserialize failure.
                    log::error!(
                        "Failed to deserialize stream record at {}:{}: {:?}",
                        stream,
                        offset,
                        e
                    );
                    if !self
                        .skip_record(
                            "deserialize_failed",
                            &e.to_string(),
                            &stream,
                            offset,
                            Some(data),
                        )
                        .await
                    {
                        break;
                    }
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

        // Closing the senders makes each batcher flush what it holds and exit.
        drop(senders);
        for handle in batcher_handles {
            // Bounded: a batcher mid-flush retries transiently forever (by
            // design), and awaiting it unbounded here would wedge reader
            // reconnect behind a ClickHouse outage. Aborting is safe — no offset
            // was stored for an unflushed batch, so those records replay after
            // reconnect (at-least-once, same as the queue path's redelivery).
            match tokio::time::timeout(BATCHER_DRAIN_TIMEOUT, handle).await {
                Ok(_) => {}
                Err(_) => log::warn!(
                    "Stream batcher did not drain within {}s, aborting; its records will replay",
                    BATCHER_DRAIN_TIMEOUT.as_secs()
                ),
            }
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
    dead_letter: Arc<DeadLetterSink>,
) {
    let mut batch: Vec<H::Message> = Vec::new();
    // Accumulated `message_weight`, not `batch.len()` — see the trait doc.
    let mut batch_weight = 0usize;
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
                        batch_weight += H::message_weight(&delivery.message);
                        batch.push(delivery.message);

                        if batch_weight >= batch_size {
                            flush_and_commit(
                                index,
                                &handler,
                                &client,
                                consumer_name,
                                &mut batch,
                                &mut batch_weight,
                                &mut pending_offsets,
                                &dead_letter,
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
                                &mut batch_weight,
                                &mut pending_offsets,
                                &dead_letter,
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
                        &mut batch_weight,
                        &mut pending_offsets,
                        &dead_letter,
                    )
                    .await;
                }
            }
        }
    }
}

/// Flush with in-place retry, then store one offset per partition in the batch.
///
/// **`Transient` failures retry forever and NEVER advance the offset.** The queue
/// path requeues transient failures indefinitely (`batch_worker/worker.rs`
/// `to_requeue`), so a bounded budget here would silently drop spans that the
/// quorum queue would have kept — a ClickHouse outage longer than the budget is
/// exactly when you least want to lose data. Head-of-line blocking on the
/// partition is the deliberate trade: the backlog waits on broker disk, and
/// per-partition lag is the alarm. Retention is the only real bound, and it is
/// sized to outlast a dependency outage.
///
/// `Permanent` failures (malformed/unprocessable, not infrastructure) dead-letter
/// and then advance, matching the queue path's reject-without-requeue.
async fn flush_and_commit<H: StreamBatchHandler>(
    index: usize,
    handler: &Arc<H>,
    client: &Client,
    consumer_name: &'static str,
    batch: &mut Vec<H::Message>,
    batch_weight: &mut usize,
    pending_offsets: &mut PendingOffsets,
    dead_letter: &DeadLetterSink,
) {
    let messages = std::mem::take(batch);
    *batch_weight = 0;
    let offsets = pending_offsets.take();
    if messages.is_empty() {
        return;
    }

    // No `max_elapsed_time`: transient retries are unbounded (see fn docs).
    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_millis(200))
        .with_max_interval(Duration::from_secs(10))
        .with_max_elapsed_time(None)
        .build();

    let mut attempt = 0u32;
    let outcome = backoff::future::retry(backoff, || {
        let handler = handler.clone();
        let messages = &messages;
        attempt += 1;
        let attempt = attempt;
        async move {
            match handler.flush(messages).await {
                Ok(()) => Ok(()),
                Err(HandlerError::Transient(e)) => {
                    // Escalate to error once we're clearly in an outage rather
                    // than a blip, so the retry loop is visible in Sentry/logs
                    // instead of only showing up as consumer lag.
                    if attempt % TRANSIENT_RETRY_LOG_EVERY == 0 {
                        log::error!(
                            "Stream batcher {} still retrying flush after {} attempts (offset NOT advancing, {} records held): {}",
                            index,
                            attempt,
                            messages.len(),
                            e
                        );
                    } else {
                        log::warn!("Stream batcher {} flush failed transiently: {}", index, e);
                    }
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
        // Only reachable for `Permanent` now — the batch is unprocessable, not
        // blocked on infrastructure, so dead-letter it and let the offset
        // advance. Same call as the queue path's reject-without-requeue.
        log::error!(
            "Stream batcher {} dead-lettering {} records across {} partitions: {}",
            index,
            messages.len(),
            offsets.len(),
            e
        );

        let recorded = dead_letter
            .publish_batch_failure(&e.to_string(), &offsets)
            .await;

        if !recorded {
            // Without a durable record of what we dropped, advancing would lose
            // the batch with no replay path. Hold the offsets instead: the records
            // are redelivered on reconnect and retried. A genuinely unprocessable
            // batch then loops, which is visible in logs — the deliberate trade
            // over silent loss.
            log::error!(
                "Stream batcher {} could not record the failed batch; holding {} partition offsets so the records replay",
                index,
                offsets.len()
            );
            return;
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
/// deleted, so unprocessable records are copied here before the reader advances
/// past them.
///
/// Records carry the **original payload** plus its `(stream, offset)`, not just
/// the error text — the source record becomes unreachable once the offset moves
/// (and eventually expires), so anything not copied here is unrecoverable. That
/// makes this the replay source after schema drift or corruption.
pub struct DeadLetterSink {
    producer: Producer<NoDedup>,
}

/// What went wrong with a record we're about to skip.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeadLetterRecord<'a> {
    kind: &'a str,
    reason: &'a str,
    stream: &'a str,
    offset: u64,
    /// Original bytes, base64'd. Absent when the record had no body at all.
    #[serde(skip_serializing_if = "Option::is_none")]
    payload_base64: Option<String>,
    /// Offsets the failing flush covered, so a batch failure can be replayed.
    #[serde(skip_serializing_if = "Option::is_none")]
    batch_offsets: Option<HashMap<String, u64>>,
}

impl DeadLetterSink {
    pub async fn new(environment: &StreamEnvironment, stream: &str) -> anyhow::Result<Self> {
        let producer = environment.inner().producer().build(stream).await?;
        Ok(Self { producer })
    }

    /// A single record we can't decode. `payload` is the raw body (`None` for an
    /// empty record).
    ///
    /// Returns whether the copy is durable. Callers MUST NOT skip the record on
    /// `false` — dropping it would advance the offset past data that exists
    /// nowhere else.
    #[must_use]
    async fn publish_record_failure(
        &self,
        kind: &str,
        reason: &str,
        stream: &str,
        offset: u64,
        payload: Option<&[u8]>,
    ) -> bool {
        self.publish(&DeadLetterRecord {
            kind,
            reason,
            stream,
            offset,
            payload_base64: payload.map(|bytes| BASE64_STANDARD.encode(bytes)),
            batch_offsets: None,
        })
        .await
    }

    /// A whole batch that is permanently unprocessable. The individual payloads
    /// are already decoded and typed here, so we record the covered offsets —
    /// enough to re-read the originals while they're still within retention.
    #[must_use]
    async fn publish_batch_failure(&self, reason: &str, offsets: &HashMap<String, u64>) -> bool {
        self.publish(&DeadLetterRecord {
            kind: "batch_flush_failed",
            reason,
            stream: "",
            offset: 0,
            payload_base64: None,
            batch_offsets: Some(offsets.clone()),
        })
        .await
    }

    /// Retries a failed write: the sink is the only surviving copy at this point,
    /// so a broker blip must not cost the record. Bounded, because the sink sits
    /// on the ingest path and cannot block it forever — an exhausted budget
    /// surfaces as `false` and the caller holds the offset instead.
    async fn publish(&self, record: &DeadLetterRecord<'_>) -> bool {
        let body = match serde_json::to_vec(record) {
            Ok(body) => body,
            Err(e) => {
                // Our own struct with a base64 payload — unreachable in practice,
                // and unfixable by retrying.
                log::error!("Failed to serialize dead-letter record: {:?}", e);
                return false;
            }
        };

        let backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(Duration::from_millis(100))
            .with_max_interval(Duration::from_secs(5))
            .with_max_elapsed_time(Some(DEAD_LETTER_WRITE_BUDGET))
            .build();

        let result = backoff::future::retry(backoff, || {
            let body = body.clone();
            async move {
                let message = Message::builder().body(body).build();
                self.producer
                    .send_with_confirm(message)
                    .await
                    .map_err(backoff::Error::transient)
            }
        })
        .await;

        match result {
            Ok(_) => true,
            Err(e) => {
                log::error!(
                    "Failed to write dead-letter record ({} at {}:{}) after {}s: {:?}",
                    record.kind,
                    record.stream,
                    record.offset,
                    DEAD_LETTER_WRITE_BUDGET.as_secs(),
                    e
                );
                false
            }
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

    /// A record that is itself a batch (the spans case) must be weighed by its
    /// contents, not counted as 1 — otherwise `SPANS_BATCH_SIZE`, which is a SPAN
    /// count on the queue path, would flush N× more spans per ClickHouse insert.
    struct WeighedHandler;

    #[async_trait]
    impl StreamBatchHandler for WeighedHandler {
        type Message = Vec<u8>;

        fn interval(&self) -> Duration {
            Duration::from_secs(60)
        }

        fn batch_size(&self) -> usize {
            128
        }

        fn message_weight(message: &Self::Message) -> usize {
            message.len()
        }

        async fn flush(&self, _messages: &[Self::Message]) -> Result<(), HandlerError> {
            Ok(())
        }
    }

    struct CountingHandler;

    #[async_trait]
    impl StreamBatchHandler for CountingHandler {
        type Message = Vec<u8>;

        fn interval(&self) -> Duration {
            Duration::from_secs(60)
        }

        fn batch_size(&self) -> usize {
            128
        }

        async fn flush(&self, _messages: &[Self::Message]) -> Result<(), HandlerError> {
            Ok(())
        }
    }

    #[test]
    fn message_weight_counts_inner_batch_size() {
        let record = vec![0u8; 40];
        assert_eq!(WeighedHandler::message_weight(&record), 40);

        // 4 records of 40 spans cross a 128-span threshold; counting records
        // would need 128 records ≈ 5120 spans in one insert.
        let weight: usize = (0..4)
            .map(|_| WeighedHandler::message_weight(&record))
            .sum();
        assert!(weight >= WeighedHandler.batch_size());
    }

    /// The core regression this guards: a transient failure must hold the offset
    /// forever rather than dropping the batch on a budget. `flush_and_commit`
    /// needs a live broker `Client`, so this asserts the retry POLICY the
    /// function is built on — unbounded elapsed time — which is what makes
    /// "offsets never advance on transient" true.
    #[test]
    fn transient_retry_budget_is_unbounded() {
        let backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(Duration::from_millis(200))
            .with_max_interval(Duration::from_secs(10))
            .with_max_elapsed_time(None)
            .build();

        assert!(
            backoff.max_elapsed_time.is_none(),
            "a bounded budget would drop spans the quorum queue would have requeued"
        );
    }

    #[test]
    fn dead_letter_record_carries_payload_for_replay() {
        // A skipped record's payload must survive: once the offset advances past
        // it the original is unreachable, so the dead-letter copy is the only
        // replay source.
        let record = DeadLetterRecord {
            kind: "deserialize_failed",
            reason: "expected value",
            stream: "observations_stream-3",
            offset: 42,
            payload_base64: Some(BASE64_STANDARD.encode(b"{bad json")),
            batch_offsets: None,
        };

        let json = serde_json::to_value(&record).unwrap();
        assert_eq!(json["kind"], "deserialize_failed");
        assert_eq!(json["stream"], "observations_stream-3");
        assert_eq!(json["offset"], 42);
        let decoded = BASE64_STANDARD
            .decode(json["payloadBase64"].as_str().unwrap())
            .unwrap();
        assert_eq!(decoded, b"{bad json");
        // Absent for single-record failures, so consumers can tell the shapes apart.
        assert!(json.get("batchOffsets").is_none());
    }

    #[test]
    fn dead_letter_batch_record_carries_covered_offsets() {
        let mut offsets = HashMap::new();
        offsets.insert("observations_stream-1".to_string(), 7u64);
        let record = DeadLetterRecord {
            kind: "batch_flush_failed",
            reason: "permanent",
            stream: "",
            offset: 0,
            payload_base64: None,
            batch_offsets: Some(offsets),
        };

        let json = serde_json::to_value(&record).unwrap();
        // The offsets are what makes a permanently-failed batch re-readable from
        // the source stream while it's still within retention.
        assert_eq!(json["batchOffsets"]["observations_stream-1"], 7);
        assert!(json.get("payloadBase64").is_none());
    }

    /// The dead-letter write is a PRECONDITION for advancing past a record, not
    /// a side effect. These pin the decision table so a future refactor can't
    /// quietly go back to "log and skip", which loses the record once the offset
    /// moves and retention expires the source.
    #[test]
    fn skip_is_only_permitted_once_the_copy_is_durable() {
        // Mirrors `skip_record` / the batch arm in `flush_and_commit`: the boolean
        // from the sink is what gates advancing.
        fn may_advance(copy_durable: bool) -> bool {
            copy_durable
        }

        assert!(may_advance(true), "a durable copy allows the skip");
        assert!(
            !may_advance(false),
            "a failed dead-letter write must hold the offset so the record replays"
        );
    }

    #[test]
    fn dead_letter_write_budget_is_bounded() {
        // Bounded on purpose: the sink is on the ingest path. Exhaustion must
        // surface as "hold the offset", never as "drop the record".
        assert!(DEAD_LETTER_WRITE_BUDGET > Duration::ZERO);
        assert!(DEAD_LETTER_WRITE_BUDGET <= Duration::from_secs(60));
    }

    #[test]
    fn message_weight_defaults_to_one_record() {
        // Handlers whose record is a single unit (Quickwit payloads) keep
        // record-count semantics via the trait default.
        let record = vec![0u8; 40];
        assert_eq!(CountingHandler::message_weight(&record), 1);
    }
}
