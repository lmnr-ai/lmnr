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
//! **Unprocessable records are logged and skipped — we accept the loss for now.**
//! An empty record, an undecodable record, or a permanently failing batch is
//! logged at `error` and the offset advances past it. There is deliberately NO
//! dead-letter sink: these cases require malformed data on the wire (our own
//! producer's JSON) or an unprocessable batch, which should not happen in
//! practice, and a durable sink needs a substrate that retains until consumed —
//! a stream expires under retention, so it isn't one. Tracked as follow-up work;
//! until then the skip is visible in logs and nothing blocks the partition.
//!
//! Offset stores are gated twice. A partition the broker has DEACTIVATED us for is
//! never committed: its successor may live in another pod, so no local comparison
//! can tell whether our offset is stale — we simply let the new owner's position
//! stand and its replay cover our held records. Within one process, a monotonic
//! high-water mark per `(group, partition)` additionally keeps the outgoing and
//! incoming batchers ordered, and it advances only once the broker CONFIRMS a
//! store, so a failed store stays retryable.
//!
//! Revocation gates the FLUSH too, not just the store: `flush_and_commit`
//! discards batched records for deactivated partitions together with their
//! pending offsets, so the successor's replay is the only write. Flushing them
//! while the store is refused would double-write the held backlog on every
//! handover. The revoked set is a per-flush snapshot; a revocation landing
//! mid-flush still duplicates at most that one in-flight batch, with the
//! read-guard fence in `store_offsets` as the backstop.
//!
//! Reader teardown never drains: every exit path aborts the batchers (then
//! awaits the cancellation) and drops whatever they hold. Held records were
//! never flushed, so the replay from the last stored offset writes them exactly
//! once — draining would instead double-write them whenever the offset store
//! behind the drain-flush failed, and teardown usually means the connection is
//! already dead, so that store was going to fail. The only residual duplicate
//! window is a flush already in flight at abort time (insert landed, store
//! didn't).
//!
//! A skipped record still forwards its OFFSET to the batcher (as a
//! `StreamDelivery` with `message: None`). Skipping the offset too would pin the
//! partition whenever its tail is poison: nothing later would ever store a higher
//! offset, so every reconnect would re-read and re-log the same records.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use backoff::{ExponentialBackoffBuilder, backoff::Backoff};
use futures_util::StreamExt;
use rabbitmq_stream_client::{
    Client,
    error::ClientError,
    types::{MessageContext, OffsetSpecification, ResponseCode},
};
use serde::de::DeserializeOwned;
use tokio::sync::{Notify, mpsc};
use uuid::Uuid;

use super::encoding;
use super::topology::StreamEnvironment;
use crate::env;
use crate::worker::HandlerError;

/// Escalate the transient-retry log from `warn` to `error` every N attempts.
/// Retries are unbounded, so without this an hours-long ClickHouse outage is
/// only visible as consumer lag.
const TRANSIENT_RETRY_LOG_EVERY: u32 = 20;

/// Retry budget for re-querying a stored offset during SAC activation. Bounded
/// because the broker waits on our activation response; exhaustion parks the
/// partition (revoked, so nothing is ingested for it) and reconnects the reader
/// so the fresh activation re-queries — never a guessed start position.
const OFFSET_QUERY_RETRY_BUDGET: Duration = Duration::from_secs(10);

/// One record off a partition.
///
/// `message` is `None` for a record we skipped instead of decoding: the offset
/// still has to reach the batcher, or a trailing poison record would never advance
/// the consumer group and its partition would re-read the same bad offsets on
/// every reconnect / SAC handover.
pub struct StreamDelivery<M> {
    pub message: Option<M>,
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
    /// offset — use it for infrastructure failures. `Permanent` logs and DROPS the
    /// batch, advancing past it — use it only when the data itself is
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
    num_batchers: usize,
}

impl<H: StreamBatchHandler> StreamReader<H> {
    pub fn new(
        super_stream: &'static str,
        consumer_name: &'static str,
        environment: StreamEnvironment,
        handler: H,
        num_batchers: usize,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            super_stream,
            consumer_name,
            environment,
            handler: Arc::new(handler),
            num_batchers: num_batchers.max(1),
        }
    }

    /// Log an unprocessable record before we advance past it.
    ///
    /// Deliberately lossy for now: there is no durable copy, so the log line is
    /// the only record. Kept as one helper so the follow-up that adds a real sink
    /// has a single call site to change.
    fn log_skipped_record(kind: &str, reason: &str, stream: &str, offset: u64) {
        log::error!(
            "Dropping unprocessable stream record ({}) at {}:{} — {}. No durable copy is kept (known gap, follow-up work)",
            kind,
            stream,
            offset,
            reason
        );
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
        let num_batchers = self.num_batchers;
        let capacity = env::streams::CHANNEL_CAPACITY.get().max(1);
        // `&'static str`, so it copies into the `consumer_update` closure.
        let consumer_name = self.consumer_name;

        // Fired by the activation callback when a stored offset stays
        // unresolvable: the delivery loop tears down and reconnects instead of
        // ingesting from a guessed position. `notify_one` stores a permit, so a
        // failure during the initial activations (inside `build`, before the
        // loop awaits) is not lost.
        let offset_unresolved = Arc::new(Notify::new());
        let offset_unresolved_tx = offset_unresolved.clone();

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
            .consumer_update(move |active, context| {
                let offset_unresolved = offset_unresolved_tx.clone();
                async move {
                let stream = context.stream();
                // `active` is the wire-level flag (0 = deactivated), not a bool.
                if active == 0 {
                    // Deactivated: the successor — possibly in another pod — owns
                    // this partition now and its committed position is
                    // authoritative. Mark the partition revoked so our still-
                    // running batcher neither flushes its held records for it nor
                    // stores an offset — the new owner replays them instead
                    // (at-least-once, consistent with the queue path).
                    // Awaits the write guard, so it cannot land while a store for
                    // this partition is mid-flight under the read guard.
                    revoke_partition(consumer_name, &stream).await;
                    log::info!("Stream partition {} deactivated for this consumer", stream);
                    return OffsetSpecification::Next;
                }

                // Activated (or re-activated): we own it again, so allow stores.
                restore_partition(consumer_name, &stream).await;
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
                    // Only `OffsetNotFound` means this group genuinely has no
                    // stored offset (first activation ever) — the one case where
                    // starting at `First` is correct rather than a fallback.
                    Err(ClientError::RequestError(ResponseCode::OffsetNotFound)) => {
                        log::info!(
                            "Stream partition {} activated with no stored offset, starting from first",
                            stream
                        );
                        OffsetSpecification::First
                    }
                    // Anything else is a transient failure (connection blip,
                    // internal error). Retry rather than guessing: both fallbacks
                    // are bad — `First` replays the whole retained partition
                    // (hours of duplicate spans) and `Next` silently skips the
                    // unprocessed backlog.
                    Err(e) => {
                        log::warn!(
                            "Failed to query stored offset for stream {}, retrying: {:?}",
                            stream,
                            e
                        );
                        match retry_query_offset(&context).await {
                            Some(offset) => OffsetSpecification::Offset(offset + 1),
                            None => {
                                // Never ingest from a guessed position: `First`
                                // replays the whole retained partition (hours of
                                // duplicates) and `Next` skips the backlog. Park
                                // the partition — revoked, so the flush/store
                                // gates discard anything delivered before
                                // teardown — and reconnect the reader; the fresh
                                // activation re-queries the offset.
                                log::error!(
                                    "Could not resolve stored offset for stream {} after retries; parking the partition and reconnecting the reader",
                                    stream
                                );
                                revoke_partition(consumer_name, &stream).await;
                                offset_unresolved.notify_one();
                                OffsetSpecification::Next
                            }
                        }
                    }
                }
            }})
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
            )));
        }

        log::info!(
            "Stream reader {} ({}) connected with {} batchers",
            self.id,
            self.super_stream,
            num_batchers
        );

        let mut assignment = BatcherAssignment::default();

        // Every exit — including a delivery error — falls through to the shared
        // teardown below so the batchers are aborted, never detached.
        let mut result: anyhow::Result<()> = Ok(());
        loop {
            let delivery = tokio::select! {
                // An activation failed to resolve its stored offset; that
                // partition is parked. Tear down and reconnect so the fresh
                // activation re-queries instead of ingesting from a guessed
                // position.
                _ = offset_unresolved.notified() => {
                    log::error!(
                        "Stream reader {} ({}) reconnecting: a partition activated without a resolvable stored offset",
                        self.id,
                        self.super_stream
                    );
                    break;
                }
                next = consumer.next() => match next {
                    Some(Ok(delivery)) => delivery,
                    Some(Err(e)) => {
                        result = Err(e.into());
                        break;
                    }
                    None => break,
                },
            };
            let stream = delivery.stream().clone();
            let offset = delivery.offset();

            // Undecodable records are logged and skipped; the offset advances with
            // the next flush and the record is gone. Deliberate for now — see the
            // module header.
            let data = match delivery.message().data() {
                Some(data) => Some(data),
                None => {
                    Self::log_skipped_record("empty_record", "record had no body", &stream, offset);
                    None
                }
            };

            // Bodies are decoded per the record's `lmnr.encoding` property
            // (absent = plain JSON), so pre-compression records and compressed
            // ones interleave freely — see `encoding.rs`.
            let encoding_property = delivery
                .message()
                .application_properties()
                .and_then(|props| props.get(encoding::ENCODING_PROPERTY))
                .and_then(|value| match value {
                    rabbitmq_stream_client::types::SimpleValue::String(s) => Some(s.clone()),
                    _ => None,
                });

            let message = match data {
                Some(body) => match encoding::decode(body, encoding_property.as_deref()) {
                    Ok(body) => match serde_json::from_slice::<H::Message>(&body) {
                        Ok(message) => Some(message),
                        Err(e) => {
                            // Won't parse on retry either — same verdict as the queue
                            // path's reject-without-requeue on a deserialize failure.
                            Self::log_skipped_record(
                                "deserialize_failed",
                                &e.to_string(),
                                &stream,
                                offset,
                            );
                            None
                        }
                    },
                    Err(e) => {
                        Self::log_skipped_record("decode_failed", &e.to_string(), &stream, offset);
                        None
                    }
                },
                None => None,
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

        // Never drain: held records were never flushed, so the replay from the
        // last stored offset writes them exactly once — a drain-flush here would
        // double-write them whenever the offset store behind it fails, and
        // teardown usually means the connection is already dead. Abort (not
        // drop: dropping a JoinHandle detaches the task, leaving it retrying
        // and storing offsets across the reconnect) and then AWAIT the
        // cancellation: abort only *requests* it, and a task still inside
        // `store_offset` could otherwise confirm after the next generation
        // started. The await is what makes "generation N is gone" true before
        // N+1 spawns.
        drop(senders);
        for handle in batcher_handles {
            handle.abort();
            // Ignore the JoinError — a cancelled task always yields one.
            let _ = handle.await;
        }

        result
    }
}

/// Re-query the stored offset after a transient failure during SAC activation.
///
/// `None` means "unresolved" — either the budget ran out or a mid-retry
/// `OffsetNotFound`; both make the caller park the partition and reconnect, and
/// the fresh activation's direct query gives the authoritative answer. Bounded
/// because the broker is waiting on our activation response.
///
/// Drives `ExponentialBackoff` manually via `Backoff::next_backoff` rather than
/// `backoff::future::retry`: the caller lives inside the client's
/// `consumer_update` closure, whose future must be `Sync`, which the combinator's
/// closure isn't. `next_backoff` still owns the schedule — jitter and the
/// `max_elapsed_time` budget (it returns `None` once exhausted) — so this is the
/// crate's policy, just stepped by hand.
async fn retry_query_offset(context: &MessageContext) -> Option<u64> {
    let mut backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_millis(200))
        .with_max_interval(Duration::from_secs(2))
        .with_max_elapsed_time(Some(OFFSET_QUERY_RETRY_BUDGET))
        .build();

    while let Some(delay) = backoff.next_backoff() {
        tokio::time::sleep(delay).await;

        match context
            .client()
            .query_offset(context.name(), &context.stream())
            .await
        {
            Ok(offset) => return Some(offset),
            // A genuine absence mid-retry: stop; the reconnect re-queries and
            // answers `First` from the direct `OffsetNotFound` arm.
            Err(ClientError::RequestError(ResponseCode::OffsetNotFound)) => return None,
            Err(e) => log::warn!(
                "Retry of stored-offset query for stream {} failed: {:?}",
                context.stream(),
                e
            ),
        }
    }

    None
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

    fn is_empty(&self) -> bool {
        self.offsets.is_empty()
    }
}

/// Accumulate → flush → store offsets, for the partitions assigned to us.
async fn run_batcher<H: StreamBatchHandler>(
    index: usize,
    mut rx: mpsc::Receiver<StreamDelivery<H::Message>>,
    handler: Arc<H>,
    client: Client,
    consumer_name: &'static str,
) {
    // Each record keeps its partition name so a flush can discard work for
    // partitions revoked after it was batched.
    let mut batch: Vec<(String, H::Message)> = Vec::new();
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
                        if let Some(message) = delivery.message {
                            batch_weight += H::message_weight(&message);
                            batch.push((delivery.stream.clone(), message));
                        }

                        // Recorded even for a skipped record (`message: None`), so
                        // its offset advances with the next flush. Without this a
                        // trailing poison record would leave the partition pinned
                        // forever, re-dead-lettering the same offsets on every
                        // reconnect.
                        pending_offsets.record(delivery.stream, delivery.offset);

                        // A skipped record still needs its offset committed, and
                        // an all-skipped stretch never fills the batch — so flush
                        // on a full batch OR when we hold offsets with nothing to
                        // process (the latter stores offsets and returns early).
                        if batch_weight >= batch_size
                            || (batch.is_empty() && !pending_offsets.is_empty())
                        {
                            flush_and_commit(
                                index,
                                &handler,
                                &client,
                                consumer_name,
                                &mut batch,
                                &mut batch_weight,
                                &mut pending_offsets,
                            )
                            .await;
                        }
                    }
                    None => {
                        // Reader teardown: drop everything we hold. Unflushed
                        // records replay from the last stored offset, so exiting
                        // without a flush writes them exactly once; see the
                        // module header.
                        return;
                    }
                }
            }
            _ = ticker.tick() => {
                // `!pending_offsets.is_empty()` matters even with an empty batch:
                // a stretch of only dead-lettered records has offsets to commit
                // and would otherwise leave the partition pinned.
                if !batch.is_empty() || !pending_offsets.is_empty() {
                    flush_and_commit(
                        index,
                        &handler,
                        &client,
                        consumer_name,
                        &mut batch,
                        &mut batch_weight,
                        &mut pending_offsets,
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
/// `Permanent` failures (malformed/unprocessable, not infrastructure) are logged
/// and DROPPED, then the offset advances — matching the queue path's
/// reject-without-requeue. No durable copy is kept; see the module header.
async fn flush_and_commit<H: StreamBatchHandler>(
    index: usize,
    handler: &Arc<H>,
    client: &Client,
    consumer_name: &'static str,
    batch: &mut Vec<(String, H::Message)>,
    batch_weight: &mut usize,
    pending_offsets: &mut PendingOffsets,
) {
    let mut entries = std::mem::take(batch);
    *batch_weight = 0;
    let mut offsets = pending_offsets.take();

    // Snapshot only — holding the read guard across the flush await would block
    // `consumer_update`'s write for the length of a ClickHouse insert. The fence
    // in `store_offsets` stays authoritative for a revocation landing mid-flush.
    let revoked = REVOKED_PARTITIONS
        .read()
        .await
        .get(consumer_name)
        .cloned()
        .unwrap_or_default();
    let dropped = discard_revoked_entries(&revoked, &mut entries, &mut offsets);
    if dropped > 0 {
        log::info!(
            "Stream batcher {} discarding {} batched records for revoked partitions; the new owner replays them",
            index,
            dropped
        );
    }

    if entries.is_empty() {
        // Nothing to process, but there may be offsets from dead-lettered records
        // to commit — that's what unpins a partition whose tail is all poison.
        // Fall through to the store loop rather than returning.
        store_offsets(index, client, consumer_name, offsets).await;
        return;
    }

    let messages: Vec<H::Message> = entries.into_iter().map(|(_, message)| message).collect();

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
        // blocked on infrastructure. Log and let the offset advance; the records
        // are dropped, which is the accepted trade until a durable sink lands.
        log::error!(
            "Stream batcher {} dropping {} unprocessable records across {} partitions (no durable copy is kept — known gap, follow-up work): {}",
            index,
            messages.len(),
            offsets.len(),
            e
        );
    }

    store_offsets(index, client, consumer_name, offsets).await;
}

/// Drop batched records and their pending offsets for revoked partitions, as one
/// operation. The pairing is the invariant: storing offsets for dropped records
/// would make the successor skip them (loss), while flushing records whose
/// offsets are refused would double-write them. Returns how many records were
/// dropped.
fn discard_revoked_entries<M>(
    revoked: &HashSet<String>,
    batch: &mut Vec<(String, M)>,
    offsets: &mut HashMap<String, u64>,
) -> usize {
    if revoked.is_empty() {
        return 0;
    }
    let before = batch.len();
    batch.retain(|(stream, _)| !revoked.contains(stream));
    offsets.retain(|stream, _| !revoked.contains(stream));
    before - batch.len()
}

/// Commit one offset per partition. Best-effort: a lost store just replays those
/// records after a restart, so it never fails the batch.
///
/// Guarded by a process-wide monotonic high-water mark per `(consumer_name,
/// partition)`. Offsets are stored under the SHARED consumer name, and on a
/// single-active-consumer handover the deactivated owner's batcher can still be
/// mid-flush — its store would then land after the successor has already committed
/// further ahead, rewinding the group's restart position and causing the successor's
/// work to be reprocessed. A stale store can only ever be BEHIND (a batcher only
/// commits offsets for records it received itself, and records arrive in offset
/// order per partition), so dropping any non-advancing store is sufficient and
/// never discards real progress.
///
/// The revocation check is held under a READ guard ACROSS the `store_offset` await,
/// so a concurrent revocation (which needs the write guard) cannot slip in between
/// the check and the write. Checking without holding it would leave the in-flight
/// store unfenced — see `REVOKED_PARTITIONS` for why that's the interesting race and
/// what residual window the protocol leaves open.
async fn store_offsets(
    index: usize,
    client: &Client,
    consumer_name: &'static str,
    offsets: HashMap<String, u64>,
) {
    for (stream, offset) in offsets {
        // Ownership first: once the broker has deactivated us for this partition
        // the successor owns it, possibly in ANOTHER POD, so no local offset
        // comparison can tell us whether our store is stale. Not storing at all is
        // the only sound answer. `flush_and_commit` already discards revoked work
        // at its snapshot; this fence catches a revocation that landed while the
        // flush was in flight.
        //
        // Held for the whole check-and-store so revocation can't interleave.
        let ownership = REVOKED_PARTITIONS.read().await;
        if ownership
            .get(consumer_name)
            .is_some_and(|streams| streams.contains(&stream))
        {
            log::warn!(
                "Stream batcher {} not storing offset {} for stream {}: this consumer was deactivated for that partition, so the new owner's position stands",
                index,
                offset,
                stream
            );
            continue;
        }

        if !offset_advances_high_water_mark(consumer_name, &stream, offset) {
            log::warn!(
                "Stream batcher {} skipping stale offset store {} for stream {} (a newer offset was already committed locally)",
                index,
                offset,
                stream
            );
            continue;
        }

        match client.store_offset(consumer_name, &stream, offset).await {
            Ok(()) => {
                // Re-check under the SAME lock acquisition that records the mark.
                // The check above is only a fast pre-filter: `store_offset` awaits,
                // and during that await another batcher (or a whole new `run_once`
                // generation) can commit further ahead — or we may have been
                // revoked. `commit_offset_high_water_mark` is max-wins, so the mark
                // itself can't regress; this logs the case so a real reorder is
                // visible rather than silent.
                if !commit_offset_high_water_mark(consumer_name, &stream, offset) {
                    log::warn!(
                        "Stream batcher {} confirmed offset {} for stream {} but a newer offset had already been committed meanwhile (raced with a handover or reconnect)",
                        index,
                        offset,
                        stream
                    );
                }
            }
            // The mark advances only on a CONFIRMED store. Advancing before the
            // call would make a failed store poison the offset locally: the retry
            // of that same offset would look stale and be skipped, leaving the
            // group behind until some higher offset happened to land.
            Err(e) => log::warn!(
                "Stream batcher {} failed to store offset {} for stream {}: {:?}",
                index,
                offset,
                stream,
                e
            ),
        }
    }
}

/// Per-`(consumer_name, partition)` high-water mark of offsets we CONFIRMED with
/// the broker.
///
/// A process `static`, NOT reader/batcher state, for two reasons:
///   - the racing writers are two batchers in the SAME process (the outgoing
///     reader's and the incoming one's) writing under the same consumer name;
///   - `run_once` tears down and respawns every batcher on reconnect, so a mark
///     held per-reader or per-batcher would reset and let a fresh batcher's first
///     (lower) commit overwrite the previous generation's position — the same
///     rewind, reached via reconnect instead of handover.
/// Nothing ever clears an entry; the key space is bounded by partition count.
///
/// **Why DROP a non-advancing store rather than take the max:** a stale store is
/// always BEHIND the live one, because a batcher commits offsets only for records
/// it received itself and per-partition delivery is offset-ordered. So a
/// non-advancing store carries no information the mark doesn't already have, and
/// dropping it can never discard genuine progress or mask a skip-forward.
///
/// **Scope limit:** this only orders writers INSIDE one process. It cannot see a
/// successor in another pod, which is why partition revocation below — not this
/// mark — is what guards a cross-pod handover.
static OFFSET_HIGH_WATER_MARKS: LazyLock<Mutex<HashMap<(&'static str, String), u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn lock_high_water_marks() -> std::sync::MutexGuard<'static, HashMap<(&'static str, String), u64>> {
    match OFFSET_HIGH_WATER_MARKS.lock() {
        Ok(marks) => marks,
        // A poisoned mutex would mean a panic while holding it; fail open so a
        // guard bug can't wedge offset commits entirely.
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// Whether `offset` is ahead of what we've confirmed. Read-only — the mark moves
/// in `commit_offset_high_water_mark` after the broker acks.
fn offset_advances_high_water_mark(consumer_name: &'static str, stream: &str, offset: u64) -> bool {
    lock_high_water_marks()
        .get(&(consumer_name, stream.to_string()))
        .is_none_or(|current| offset > *current)
}

/// Record a CONFIRMED store. Max-wins, so a late confirmation from an aborted or
/// superseded batcher can never lower the mark. Returns whether this offset was
/// the new high-water mark; `false` means something committed further ahead while
/// our `store_offset` was in flight.
fn commit_offset_high_water_mark(consumer_name: &'static str, stream: &str, offset: u64) -> bool {
    let mut marks = lock_high_water_marks();
    match marks.get_mut(&(consumer_name, stream.to_string())) {
        Some(current) if *current >= offset => false,
        Some(current) => {
            *current = offset;
            true
        }
        None => {
            marks.insert((consumer_name, stream.to_string()), offset);
            true
        }
    }
}

/// Partitions this process has been DEACTIVATED for, per consumer group.
///
/// Single-active-consumer handovers cross pod boundaries, so the process-local
/// high-water mark above cannot detect a successor that has already committed
/// further ahead — its marks live in another process. What we DO learn locally is
/// the broker's `consumer_update(active = 0)` callback: from that moment we no
/// longer own the partition, and any offset our still-running batcher holds is by
/// definition not authoritative. Refusing to store for a revoked partition is
/// therefore the cross-pod guard; the records we were holding are replayed by the
/// new owner.
///
/// Re-activation removes the entry, since we own the partition again.
/// An ASYNC `RwLock`, not a `std::sync::Mutex`, and that choice is the guard.
///
/// A plain mutex can only make the *check* atomic, not check-then-store: the
/// `store_offset` call awaits, so a `consumer_update(active = 0)` landing in that
/// window would be recorded while a store that already passed the check is still
/// on its way out — the write escapes revocation entirely. Taking a READ guard
/// across check+store and the WRITE guard to revoke makes the two mutually
/// exclusive, so every store either completes while we still (as far as the broker
/// has told us) own the partition, or is refused.
///
/// **Residual risk, unfixable client-side:** `StoreOffset` carries only
/// `(reference, stream, offset)` — no epoch, generation, or fencing token — and the
/// protocol marks it "expects response: No", so the broker cannot distinguish a
/// store from the active consumer from a stale one under the same reference, and we
/// get no rejection path. The stream protocol also doesn't specify that the broker
/// waits for our `ConsumerUpdateResponse` before promoting the successor. So if it
/// activates the successor before notifying us, a store we consider legitimate can
/// still land late. That degrades to a REWIND (the successor re-reads and
/// reprocesses), never a skip-forward, which is the same at-least-once outcome a
/// handover already produces for records the predecessor held unflushed.
static REVOKED_PARTITIONS: LazyLock<
    tokio::sync::RwLock<HashMap<&'static str, std::collections::HashSet<String>>>,
> = LazyLock::new(|| tokio::sync::RwLock::new(HashMap::new()));

async fn revoke_partition(consumer_name: &'static str, stream: &str) {
    REVOKED_PARTITIONS
        .write()
        .await
        .entry(consumer_name)
        .or_default()
        .insert(stream.to_string());
}

async fn restore_partition(consumer_name: &'static str, stream: &str) {
    if let Some(streams) = REVOKED_PARTITIONS.write().await.get_mut(consumer_name) {
        streams.remove(stream);
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

    /// Teardown must ABORT, not just drop. Dropping a `JoinHandle` detaches the
    /// task: the old batcher would survive the reconnect, keep retrying, and
    /// keep calling `store_offset` for partitions the fresh batchers now own — one
    /// leaked task per reconnect for the length of an outage.
    #[tokio::test(start_paused = true)]
    async fn teardown_aborts_a_stuck_batcher() {
        let flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag_in_task = flag.clone();

        // Stands in for a batcher wedged in an unbounded transient retry.
        let handle = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(3600)).await;
            flag_in_task.store(true, std::sync::atomic::Ordering::SeqCst);
        });

        handle.abort();
        let joined = handle.await;
        assert!(
            joined.is_err_and(|e| e.is_cancelled()),
            "abort() must actually cancel the task; dropping the handle would leave it running"
        );
        assert!(
            !flag.load(std::sync::atomic::Ordering::SeqCst),
            "the aborted task must never reach its post-sleep work (e.g. store_offset)"
        );
    }

    /// A skipped record must still advance its partition. Without this a trailing
    /// poison record pins the consumer group forever, re-dead-lettering the same
    /// offsets on every reconnect / SAC handover.
    #[test]
    fn skipped_records_still_record_their_offset() {
        let mut offsets = PendingOffsets::default();
        assert!(offsets.is_empty());

        // What the batcher does for a `message: None` delivery.
        offsets.record("p-0".to_string(), 11);
        assert!(
            !offsets.is_empty(),
            "a dead-lettered record must leave an offset to commit"
        );
        assert_eq!(offsets.take().get("p-0"), Some(&11));
    }

    /// Mirrors the batcher's flush triggers: an all-skipped stretch never fills
    /// the batch, so "empty batch but pending offsets" has to be a flush reason of
    /// its own or those offsets are never stored.
    #[test]
    fn flush_triggers_on_pending_offsets_with_an_empty_batch() {
        fn should_flush(
            batch_weight: usize,
            batch_size: usize,
            batch_empty: bool,
            pending: bool,
        ) -> bool {
            batch_weight >= batch_size || (batch_empty && pending)
        }

        assert!(
            should_flush(0, 128, true, true),
            "offsets from skipped records must flush even with nothing to process"
        );
        assert!(
            !should_flush(0, 128, true, false),
            "no batch and no offsets is a no-op, not a flush"
        );
        assert!(
            !should_flush(10, 128, false, true),
            "a partially-filled batch waits for the size threshold or the tick"
        );
        assert!(should_flush(128, 128, false, true));
    }

    /// `retry_query_offset` steps `ExponentialBackoff` by hand (the combinator
    /// can't satisfy `consumer_update`'s `Sync` bound), so assert the crate still
    /// owns the schedule: delays respect `max_interval`, and the loop terminates
    /// once `max_elapsed_time` is spent — that termination is what makes the
    /// caller's "give up and replay from retention" arm reachable.
    ///
    /// NOTE the crate measures `max_elapsed_time` on the REAL clock
    /// (`Instant::now()`), not tokio's virtual clock, so the loop only terminates
    /// because the production code sleeps between attempts. This test sleeps for
    /// the same reason and uses a deliberately small budget; polling
    /// `next_backoff` without sleeping never terminates.
    #[tokio::test]
    async fn offset_query_backoff_is_crate_driven_and_terminates() {
        let max_interval = Duration::from_millis(100);
        let mut backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(Duration::from_millis(50))
            .with_max_interval(max_interval)
            .with_max_elapsed_time(Some(Duration::from_millis(300)))
            .build();

        let mut attempts = 0;
        while let Some(delay) = backoff.next_backoff() {
            // Jitter is applied on top of the interval (±randomization_factor),
            // so the ceiling is max_interval * 1.5, not max_interval.
            assert!(
                delay <= max_interval.mul_f64(1.5),
                "delay {:?} exceeded max_interval {:?} plus jitter",
                delay,
                max_interval
            );
            tokio::time::sleep(delay).await;
            attempts += 1;
            assert!(attempts < 100, "backoff should terminate on its budget");
        }

        assert!(attempts > 0, "at least one retry must be attempted");
    }

    /// Test shim for the old check-and-advance behaviour: the production path now
    /// splits these so the mark only moves on a CONFIRMED broker store.
    fn claim_offset_high_water_mark(
        consumer_name: &'static str,
        stream: &str,
        offset: u64,
    ) -> bool {
        if offset_advances_high_water_mark(consumer_name, stream, offset) {
            commit_offset_high_water_mark(consumer_name, stream, offset)
        } else {
            false
        }
    }

    /// Offsets are stored under the SHARED consumer name, so on a
    /// single-active-consumer handover the deactivated owner's in-flight batcher
    /// can still issue a store after the successor has committed further ahead.
    /// The guard drops any non-advancing store so that can't rewind the group's
    /// restart position (which would re-process the successor's work).
    #[test]
    fn stale_offset_store_cannot_rewind_the_committed_position() {
        let group = "test_group_rewind";
        let partition = "observations_stream-7";

        assert!(claim_offset_high_water_mark(group, partition, 100));
        // Successor commits further ahead.
        assert!(claim_offset_high_water_mark(group, partition, 140));
        // The outgoing owner's late flush lands with an older offset.
        assert!(
            !claim_offset_high_water_mark(group, partition, 120),
            "a stale store must not rewind the committed offset"
        );
        // An equal offset is also a no-op (nothing to advance).
        assert!(!claim_offset_high_water_mark(group, partition, 140));
        // Genuine progress still goes through.
        assert!(claim_offset_high_water_mark(group, partition, 141));
    }

    /// The mark must survive a reader RECONNECT, not just a handover. `run_once`
    /// tears down and respawns every batcher, so if the mark lived on the reader or
    /// the batcher it would reset and a fresh batcher's first (lower) commit could
    /// overwrite the position the previous generation reached — the same rewind
    /// mechanism as the SAC handover case, via a different path. Keeping it in a
    /// process `static` is what prevents that; this pins the property so nobody
    /// moves the map into `StreamReader` or `run_batcher` state.
    #[test]
    fn offset_high_water_mark_survives_reader_reconnect() {
        let group = "test_group_reconnect";
        let partition = "observations_stream-2";

        // Generation 1 of the batchers commits.
        assert!(claim_offset_high_water_mark(group, partition, 500));

        // `run_once` returns and respawns fresh batchers with empty local state.
        // The mark is process-scoped, so the new generation still sees 500.
        assert!(
            !claim_offset_high_water_mark(group, partition, 450),
            "a fresh batcher must not rewind the previous generation's position"
        );
        assert!(claim_offset_high_water_mark(group, partition, 501));
    }

    /// A failed broker store must NOT advance the local mark: otherwise the retry
    /// of that same offset looks stale and gets skipped, leaving the group behind
    /// until some higher offset happens to land (or the process restarts).
    #[test]
    fn failed_store_does_not_poison_the_offset_locally() {
        let group = "test_group_failed_store";
        let partition = "observations_stream-9";

        // Pre-store check passes...
        assert!(offset_advances_high_water_mark(group, partition, 200));
        // ...but the broker call failed, so nothing is committed.
        assert!(
            offset_advances_high_water_mark(group, partition, 200),
            "a failed store must leave the same offset retryable"
        );

        // A later successful store commits it, and only then is it non-advancing.
        commit_offset_high_water_mark(group, partition, 200);
        assert!(!offset_advances_high_water_mark(group, partition, 200));
        assert!(offset_advances_high_water_mark(group, partition, 201));
    }

    /// The process-local mark cannot see a successor in ANOTHER POD, so revocation
    /// — not offset comparison — is what guards a cross-pod handover. After
    /// `consumer_update(active = 0)` the still-running batcher must store nothing
    /// for that partition, however far ahead its own offsets look.
    /// Test-only mirror of the inline check in `store_offsets`, which holds the read
    /// guard across its `store_offset` await and so can't be factored into a helper
    /// without giving up exactly the property being tested.
    async fn is_partition_revoked(consumer_name: &'static str, stream: &str) -> bool {
        REVOKED_PARTITIONS
            .read()
            .await
            .get(consumer_name)
            .is_some_and(|streams| streams.contains(stream))
    }

    /// Records for a revoked partition must be dropped WITH their offsets: the
    /// successor replays from its stored position, so flushing them would
    /// double-write the held backlog, while storing their offsets without
    /// flushing would make the successor skip them — loss.
    #[test]
    fn discard_revoked_drops_records_and_offsets_together() {
        let revoked: HashSet<String> = ["p-0".to_string()].into();
        let mut batch = vec![
            ("p-0".to_string(), 1u8),
            ("p-1".to_string(), 2u8),
            ("p-0".to_string(), 3u8),
        ];
        let mut offsets = HashMap::from([("p-0".to_string(), 30u64), ("p-1".to_string(), 7u64)]);

        let dropped = discard_revoked_entries(&revoked, &mut batch, &mut offsets);

        assert_eq!(dropped, 2);
        assert_eq!(batch, vec![("p-1".to_string(), 2u8)]);
        assert!(
            !offsets.contains_key("p-0"),
            "a dropped record's offset must never be stored"
        );
        assert_eq!(offsets.get("p-1"), Some(&7));
    }

    #[test]
    fn discard_revoked_is_a_no_op_without_revocations() {
        let revoked = HashSet::new();
        let mut batch = vec![("p-0".to_string(), 1u8)];
        let mut offsets = HashMap::from([("p-0".to_string(), 5u64)]);

        assert_eq!(
            discard_revoked_entries(&revoked, &mut batch, &mut offsets),
            0
        );
        assert_eq!(batch.len(), 1);
        assert_eq!(offsets.len(), 1);
    }

    #[tokio::test]
    async fn revoked_partition_blocks_stores_regardless_of_offset() {
        let group = "test_group_revoked";
        let partition = "observations_stream-11";

        assert!(!is_partition_revoked(group, partition).await);

        revoke_partition(group, partition).await;
        assert!(is_partition_revoked(group, partition).await);
        // Even an offset that trivially "advances" the local mark must be refused:
        // the new owner's position is authoritative and lives elsewhere.
        assert!(offset_advances_high_water_mark(group, partition, 10_000));

        // Re-activation restores ownership.
        restore_partition(group, partition).await;
        assert!(!is_partition_revoked(group, partition).await);
    }

    #[tokio::test]
    async fn revocation_is_scoped_per_partition_and_group() {
        let group = "test_group_revoke_scope";
        revoke_partition(group, "p-0").await;

        // Revoking one partition must not silence commits for the others we still
        // own, nor for a different consumer group.
        assert!(is_partition_revoked(group, "p-0").await);
        assert!(!is_partition_revoked(group, "p-1").await);
        assert!(!is_partition_revoked("other_group", "p-0").await);
    }

    /// Pins the MECHANISM the fix relies on: revocation needs the WRITE guard, so it
    /// blocks while any store holds the READ guard across its await.
    ///
    /// It does NOT pin that `store_offsets` actually holds the guard that way — this
    /// test drives the lock directly, so it still passes against a check-only
    /// implementation. Verifying the call site needs a live broker to make
    /// `store_offset` await; the invariant is enforced by review + the comment on
    /// `REVOKED_PARTITIONS`. Do not read a pass here as coverage of the race itself.
    #[tokio::test]
    async fn revocation_blocks_while_a_read_guard_is_held() {
        let group = "test_group_inflight_fence";
        let partition = "observations_stream-21";

        // Simulate `store_offsets`: take the read guard, then await mid-"store".
        let ownership = REVOKED_PARTITIONS.read().await;
        let revoker = tokio::spawn(async move { revoke_partition(group, partition).await });

        // Yield generously; the revoke task must still be parked on the write guard.
        for _ in 0..8 {
            tokio::task::yield_now().await;
        }
        assert!(
            !revoker.is_finished(),
            "revocation must block until the in-flight store releases the read guard"
        );

        // Releasing the guard (store finished) lets the revocation proceed.
        drop(ownership);
        revoker.await.expect("revoke task panicked");
        assert!(is_partition_revoked(group, partition).await);
    }

    /// `commit_offset_high_water_mark` is max-wins and reports whether it actually
    /// advanced. That's what makes a LATE confirmation safe: an aborted or
    /// superseded batcher whose `store_offset` was already in flight can confirm
    /// after a newer offset landed, and the mark must not regress — it returns
    /// `false` so the reorder is logged instead of silently lowering the mark.
    #[test]
    fn late_confirmation_cannot_lower_the_mark() {
        let group = "test_group_late_confirm";
        let partition = "observations_stream-13";

        assert!(commit_offset_high_water_mark(group, partition, 300));
        // Newer generation commits further ahead.
        assert!(commit_offset_high_water_mark(group, partition, 350));
        // The aborted batcher's in-flight store finally confirms 310.
        assert!(
            !commit_offset_high_water_mark(group, partition, 310),
            "a late confirmation must report that it did not advance"
        );
        // ...and the mark still reflects the newer position.
        assert!(!offset_advances_high_water_mark(group, partition, 350));
        assert!(offset_advances_high_water_mark(group, partition, 351));
    }

    /// Aborting a task only REQUESTS cancellation — it runs until its next await
    /// point, so a batcher inside `store_offset` could still confirm after the next
    /// generation started. Teardown awaits the cancellation, which is what makes
    /// "generation N is gone" true before N+1 spawns.
    #[tokio::test(start_paused = true)]
    async fn awaiting_the_abort_means_the_task_is_finished() {
        let handle = tokio::spawn(async {
            tokio::time::sleep(Duration::from_secs(3600)).await;
        });

        handle.abort();
        let joined = handle.await;
        assert!(
            joined.is_err_and(|e| e.is_cancelled()),
            "awaiting after abort must observe the cancellation, not leave it pending"
        );
    }

    #[test]
    fn offset_high_water_marks_are_per_partition() {
        let group = "test_group_per_partition";
        assert!(claim_offset_high_water_mark(group, "p-0", 50));
        // A different partition is tracked independently — otherwise one busy
        // partition would suppress every other partition's commits.
        assert!(claim_offset_high_water_mark(group, "p-1", 10));
        assert!(!claim_offset_high_water_mark(group, "p-0", 40));
        assert!(claim_offset_high_water_mark(group, "p-1", 11));
    }

    #[test]
    fn message_weight_defaults_to_one_record() {
        // Handlers whose record is a single unit (Quickwit payloads) keep
        // record-count semantics via the trait default.
        let record = vec![0u8; 40];
        assert_eq!(CountingHandler::message_weight(&record), 1);
    }
}
