//! RabbitMQ Streams transport for high-volume ingest (LAM-2024).
//!
//! Why streams and not another quorum queue: a stream is an append-only disk log
//! with non-destructive reads, so a burst becomes *consumer lag on disk* instead
//! of a broker-memory backlog that trips `vm_memory_high_watermark` and blocks
//! every publisher. Retention also gives a replay window a queue can't.
//!
//! Shape:
//!   producer  → `StreamPublisher`, hash-routed by `trace_id` over a super stream
//!               so every span of a trace lands on one partition (per-trace
//!               ordering + a single writer for the PG trace upsert).
//!   consumer  → `StreamReader`: one thin read task per active partition feeding
//!               partition-affine batchers that reuse the existing
//!               `BatchMessageHandler` accumulate/flush logic. Offsets replace
//!               acks and are stored only after a successful flush.
//!
//! The AMQP `MessageQueue` path is untouched — streams are additive, chosen
//! per-payload by the producer, and gated on `RABBITMQ_STREAMS_ENABLED`.

pub mod publisher;
pub mod reader;
pub mod topology;

pub use publisher::StreamPublisher;
pub use reader::{StreamBatchHandler, StreamReader};
pub use topology::{StreamEnvironment, StreamTopology};

/// Super streams we own. The broker also creates an exchange of the same name;
/// partition streams are suffixed `-0..n-1` by the client.
///
/// Only two payloads ride streams: span export batches (observations) and
/// Quickwit indexing payloads. Each has exactly one `StreamPublisher`, built
/// in `main` at boot and threaded to its publish site as an explicit
/// `Option<Arc<StreamPublisher>>` parameter — `None` (tests, LITE, streams
/// disabled, failed connect at boot) means the caller takes the AMQP path.
pub const OBSERVATIONS_STREAM: &str = "observations_stream";
pub const SPANS_INDEXER_STREAM: &str = "spans_indexer_stream";

/// Consumer group names. This is the `reference` broker-side offset tracking is
/// keyed by, so renaming one makes the group resume from scratch — treat these as
/// persistent identifiers, not labels.
pub const OBSERVATIONS_CONSUMER_NAME: &str = "observations_workers";
pub const SPANS_INDEXER_CONSUMER_NAME: &str = "spans_indexer_workers";

/// Whether the streams transport is configured. Publishers are still
/// `Option`-threaded, so a failed connect at boot degrades to AMQP rather than
/// dropping data.
pub fn enabled() -> bool {
    crate::env::streams::ENABLED.get()
}

/// Whether the Quickwit indexing path may use streams. **Both pod roles MUST
/// call this** — the producer to decide whether to build the publisher, the
/// consumer to decide whether to spawn the reader. Anything that can make the
/// consumer skip its reader has to be checked here, or the producer publishes
/// into a stream with no reader and retention silently deletes the jobs.
///
/// So the flag is ANDed with "is the Quickwit endpoint even usable": an
/// unreachable endpoint is fine (the reader starts lazily and retries), but a
/// MALFORMED one can never build a client, and that's config both roles read
/// identically.
pub fn spans_indexer_enabled() -> bool {
    if !crate::env::streams::SPANS_INDEXER_ENABLED.get() {
        return false;
    }

    match crate::quickwit::client::QuickwitConfig::from_env().validate_ingest_endpoint() {
        Ok(()) => true,
        Err(e) => {
            log::error!(
                "RABBITMQ_STREAM_SPANS_INDEXER_ENABLED is on but QUICKWIT_INGEST_URL is malformed ({:?}) - keeping Quickwit indexing on the quorum queue",
                e
            );
            false
        }
    }
}

#[cfg(test)]
mod tests {
    /// Both pod roles call `spans_indexer_enabled`, so a malformed
    /// `QUICKWIT_INGEST_URL` must turn the WHOLE indexer path off — publisher and
    /// reader together. If only the consumer could fail on it, producers would
    /// publish into a stream with no reader and retention would delete the jobs.
    #[test]
    fn a_malformed_quickwit_endpoint_disables_the_whole_indexer_path() {
        unsafe {
            std::env::set_var("RABBITMQ_STREAM_SPANS_INDEXER_ENABLED", "true");
            std::env::set_var("QUICKWIT_INGEST_URL", "not a url");
        }
        assert!(
            !super::spans_indexer_enabled(),
            "a malformed ingest URL must disable the indexer stream for BOTH roles"
        );

        // An UNREACHABLE endpoint is well-formed, so the path stays on: the
        // reader starts lazily and the handler's transient retry drains it.
        unsafe {
            std::env::set_var("QUICKWIT_INGEST_URL", "http://127.0.0.1:1");
        }
        assert!(super::spans_indexer_enabled());

        unsafe {
            std::env::remove_var("RABBITMQ_STREAM_SPANS_INDEXER_ENABLED");
            std::env::remove_var("QUICKWIT_INGEST_URL");
        }
    }
}
