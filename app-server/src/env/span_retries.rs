//! Delayed-retry budgets for the span ingestion queues (`worker::RetryConfig`).
//! A transient failure parks the message in the queue's retry queue for the
//! delay, then the broker hands it back; after the attempt cap it is dropped.
//!
//! Delay × attempts is the longest ClickHouse / Quickwit outage the queue rides
//! out without losing spans. Both defaults cover ~1 hour.
//!
//! Every delay MUST be constant across retries: RabbitMQ expires messages only
//! at the head of a queue, so a longer TTL would hold up shorter ones behind
//! it. Changing the value on a live deployment is safe, but messages parked
//! with the old TTL delay the new ones until they drain.

use super::NumEnv;

/// How long a span batch that failed to write to ClickHouse waits in
/// `observations_retry_queue` before it is retried. Shorter means spans show
/// up sooner once ClickHouse recovers; each retry also re-runs the batch
/// against a possibly still-sick ClickHouse.
pub const SPANS_DELAY_MS: NumEnv<u64> = NumEnv::new("SPANS_TRANSIENT_RETRY_DELAY_MS", 60_000);

/// Delayed retries before a span batch is dropped (logged at `error` with the
/// span count). The cap is what stops a misclassified-transient failure from
/// looping forever: a retry republishes the message, so the quorum queue's
/// own delivery limit restarts at zero and no longer bounds it.
pub const SPANS_MAX_ATTEMPTS: NumEnv<u32> = NumEnv::new("SPANS_TRANSIENT_RETRY_MAX_ATTEMPTS", 60);

/// How long a payload that failed to index into Quickwit waits in
/// `spans_indexer_retry_queue` before it is retried. Same constraints as
/// [`SPANS_DELAY_MS`].
pub const SPANS_INDEXER_DELAY_MS: NumEnv<u64> =
    NumEnv::new("SPANS_INDEXER_TRANSIENT_RETRY_DELAY_MS", 60_000);

/// Delayed retries before an indexer payload is dropped. Same role as
/// [`SPANS_MAX_ATTEMPTS`].
pub const SPANS_INDEXER_MAX_ATTEMPTS: NumEnv<u32> =
    NumEnv::new("SPANS_INDEXER_TRANSIENT_RETRY_MAX_ATTEMPTS", 60);
