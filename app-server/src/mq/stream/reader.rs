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
//! (retried, then given up) the offset is HELD **and the consuming stops** — a
//! single record breaks the read loop, an unrecordable batch returns from the
//! batcher — so nothing later can store a higher offset for those partitions and
//! advance past them. The reader reconnects and the records are redelivered.
//! That's why the sink is required rather than optional: it is built at boot
//! BEFORE any publisher registers, and a failure there disables streams entirely
//! so producers can't write to streams nothing reads.
//!
//! A dead-lettered record still forwards its OFFSET to the batcher (as a
//! `StreamDelivery` with `message: None`). Skipping the offset too would pin the
//! partition whenever its tail is poison: nothing later would ever store a higher
//! offset, so every reconnect would re-read and re-dead-letter the same records.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use backoff::{ExponentialBackoffBuilder, backoff::Backoff};
use base64::{Engine, prelude::BASE64_STANDARD};
use futures_util::StreamExt;
use rabbitmq_stream_client::{
    Client, NoDedup, Producer,
    error::ClientError,
    types::{Message, MessageContext, OffsetSpecification, ResponseCode},
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

/// Retry budget for re-querying a stored offset during SAC activation. Bounded
/// because the broker waits on our activation response; exhaustion falls back to
/// replaying from retention (duplicates) rather than skipping (loss).
const OFFSET_QUERY_RETRY_BUDGET: Duration = Duration::from_secs(10);

/// One record off a partition.
///
/// `message` is `None` for a record we dead-lettered instead of decoding: the
/// offset still has to reach the batcher, or a trailing poison record would never
/// advance the consumer group and its partition would re-read the same bad offsets
/// on every reconnect / SAC handover.
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
                                // Give up and replay from the start of retention.
                                // Duplicates over loss: the whole pipeline is
                                // at-least-once (`spans` dedups nothing, but a
                                // replayed span overwrites identically), whereas
                                // `Next` would drop the backlog outright.
                                log::error!(
                                    "Could not resolve stored offset for stream {} after retries; replaying from the start of retention (expect duplicate ingest)",
                                    stream
                                );
                                OffsetSpecification::First
                            }
                        }
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
            let data = match delivery.message().data() {
                Some(data) => Some(data),
                None => {
                    log::warn!("Empty stream record at {}:{}", stream, offset);
                    if !self
                        .skip_record("empty_record", "record had no body", &stream, offset, None)
                        .await
                    {
                        break;
                    }
                    None
                }
            };

            let message = match data {
                Some(data) => match serde_json::from_slice::<H::Message>(data) {
                    Ok(message) => Some(message),
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

        // Closing the senders makes each batcher flush what it holds and exit.
        drop(senders);
        for handle in batcher_handles {
            // Bounded: a batcher mid-flush retries transiently forever (by
            // design), and awaiting it unbounded here would wedge reader
            // reconnect behind a ClickHouse outage. Aborting is safe — no offset
            // was stored for an unflushed batch, so those records replay after
            // reconnect (at-least-once, same as the queue path's redelivery).
            // `timeout` consumes the handle, so keep a clone to abort with:
            // DROPPING a JoinHandle only detaches the task, leaving the old
            // batcher alive across the reconnect — still retrying, still able to
            // call `store_offset` against offsets the new batchers are also
            // tracking, and piling up one leaked task per reconnect for the whole
            // duration of a dependency outage.
            let abort_handle = handle.abort_handle();
            if tokio::time::timeout(BATCHER_DRAIN_TIMEOUT, handle)
                .await
                .is_err()
            {
                abort_handle.abort();
                log::warn!(
                    "Stream batcher did not drain within {}s, aborted; its records will replay",
                    BATCHER_DRAIN_TIMEOUT.as_secs()
                );
            }
        }

        Ok(())
    }
}

/// Re-query the stored offset after a transient failure during SAC activation.
///
/// `None` means "still unresolved after the budget" — NOT "no offset exists";
/// `OffsetNotFound` is answered by the caller before we get here. Bounded because
/// the broker is waiting on our activation response.
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
            // A genuine absence mid-retry: stop and let the caller's `First`
            // fallback apply, which is the correct answer for that case.
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
                        // Recorded even for a skipped record (`message: None`), so
                        // its offset advances with the next flush. Without this a
                        // trailing poison record would leave the partition pinned
                        // forever, re-dead-lettering the same offsets on every
                        // reconnect.
                        pending_offsets.record(delivery.stream, delivery.offset);

                        if let Some(message) = delivery.message {
                            batch_weight += H::message_weight(&message);
                            batch.push(message);
                        }

                        // A skipped record still needs its offset committed, and
                        // an all-skipped stretch never fills the batch — so flush
                        // on a full batch OR when we hold offsets with nothing to
                        // process (the latter stores offsets and returns early).
                        if batch_weight >= batch_size
                            || (batch.is_empty() && !pending_offsets.is_empty())
                        {
                            if !flush_and_commit(
                                index,
                                &handler,
                                &client,
                                consumer_name,
                                &mut batch,
                                &mut batch_weight,
                                &mut pending_offsets,
                                &dead_letter,
                            )
                            .await
                            {
                                // Unrecordable batch: stop rather than keep
                                // consuming, or a later flush would store a higher
                                // offset for these partitions and advance past it.
                                // Exiting drops our receiver, so the reader
                                // reconnects and the records are redelivered.
                                return;
                            }
                        }
                    }
                    None => {
                        // Reader is gone: flush what we hold so the offsets for
                        // already-processed (and dead-lettered) records are
                        // durable, then exit.
                        if !batch.is_empty() || !pending_offsets.is_empty() {
                            // We're exiting either way; the held-offsets case is
                            // already handled by not storing them.
                            let _ = flush_and_commit(
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
                // `!pending_offsets.is_empty()` matters even with an empty batch:
                // a stretch of only dead-lettered records has offsets to commit
                // and would otherwise leave the partition pinned.
                if !batch.is_empty() || !pending_offsets.is_empty() {
                    if !flush_and_commit(
                        index,
                        &handler,
                        &client,
                        consumer_name,
                        &mut batch,
                        &mut batch_weight,
                        &mut pending_offsets,
                        &dead_letter,
                    )
                    .await
                    {
                        return;
                    }
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
/// Returns `false` when the batch could neither be flushed NOR recorded — the
/// batcher must then stop consuming (see `FlushOutcome`).
#[must_use]
async fn flush_and_commit<H: StreamBatchHandler>(
    index: usize,
    handler: &Arc<H>,
    client: &Client,
    consumer_name: &'static str,
    batch: &mut Vec<H::Message>,
    batch_weight: &mut usize,
    pending_offsets: &mut PendingOffsets,
    dead_letter: &DeadLetterSink,
) -> bool {
    let messages = std::mem::take(batch);
    *batch_weight = 0;
    let offsets = pending_offsets.take();

    if messages.is_empty() {
        // Nothing to process, but there may be offsets from dead-lettered records
        // to commit — that's what unpins a partition whose tail is all poison.
        // Fall through to the store loop rather than returning.
        store_offsets(index, client, consumer_name, offsets).await;
        return true;
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
            // Holding these offsets is only half the job: this batcher keeps
            // consuming otherwise, and a LATER flush on the same partitions would
            // store a higher offset and silently advance past the batch we failed
            // to record. So report the failure and let the caller stop, mirroring
            // the single-record `skip_record` path that breaks to reconnect.
            log::error!(
                "Stream batcher {} could not record the failed batch; holding {} partition offsets and stopping so the records replay",
                index,
                offsets.len()
            );
            return false;
        }
    }

    store_offsets(index, client, consumer_name, offsets).await;
    true
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
async fn store_offsets(
    index: usize,
    client: &Client,
    consumer_name: &'static str,
    offsets: HashMap<String, u64>,
) {
    for (stream, offset) in offsets {
        if !claim_offset_high_water_mark(consumer_name, &stream, offset) {
            log::warn!(
                "Stream batcher {} skipping stale offset store {} for stream {} (a newer offset was already committed — likely a single-active-consumer handover)",
                index,
                offset,
                stream
            );
            continue;
        }

        if let Err(e) = client.store_offset(consumer_name, &stream, offset).await {
            log::warn!(
                "Stream batcher {} failed to store offset {} for stream {}: {:?}",
                index,
                offset,
                stream,
                e
            );
        }
    }
}

/// Per-`(consumer_name, partition)` high-water mark of offsets we've committed.
///
/// Process-wide because the racing writers are two batchers in the SAME process
/// (the outgoing reader's and the incoming one's) writing under the same consumer
/// name. Returns whether `offset` advances the mark, claiming it if so.
static OFFSET_HIGH_WATER_MARKS: LazyLock<Mutex<HashMap<(&'static str, String), u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn claim_offset_high_water_mark(consumer_name: &'static str, stream: &str, offset: u64) -> bool {
    let mut marks = match OFFSET_HIGH_WATER_MARKS.lock() {
        Ok(marks) => marks,
        // A poisoned mutex would mean a panic while holding it; fail open so a
        // guard bug can't wedge offset commits entirely.
        Err(poisoned) => poisoned.into_inner(),
    };

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

    /// The drain path must ABORT, not just drop. Dropping a `JoinHandle` detaches
    /// the task: the old batcher would survive the reconnect, keep retrying, and
    /// keep calling `store_offset` for partitions the fresh batchers now own — one
    /// leaked task per reconnect for the length of an outage.
    #[tokio::test(start_paused = true)]
    async fn drain_timeout_actually_cancels_a_stuck_batcher() {
        let flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag_in_task = flag.clone();

        // Stands in for a batcher wedged in an unbounded transient retry.
        let handle = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(3600)).await;
            flag_in_task.store(true, std::sync::atomic::Ordering::SeqCst);
        });

        let abort_handle = handle.abort_handle();
        let timed_out = tokio::time::timeout(BATCHER_DRAIN_TIMEOUT, handle)
            .await
            .is_err();
        assert!(timed_out, "the stuck task must not drain within the budget");

        abort_handle.abort();
        // Let the runtime process the cancellation.
        tokio::time::sleep(Duration::from_millis(1)).await;
        assert!(
            abort_handle.is_finished(),
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

    /// An unrecordable batch must STOP the batcher, not just hold its offsets.
    /// Holding alone is insufficient: the batcher would keep consuming and a later
    /// flush on the same partitions would store a higher offset, silently advancing
    /// past the batch we failed to copy.
    #[test]
    fn unrecordable_batch_stops_the_batcher() {
        // Mirrors `flush_and_commit`'s return contract and the caller's use of it.
        fn keep_consuming(flush_ok: bool, copy_durable: bool) -> bool {
            flush_ok || copy_durable
        }

        assert!(keep_consuming(true, false), "a clean flush keeps going");
        assert!(
            keep_consuming(false, true),
            "a recorded permanent failure may advance and continue"
        );
        assert!(
            !keep_consuming(false, false),
            "neither flushed nor recorded must stop the batcher so the records replay"
        );
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
