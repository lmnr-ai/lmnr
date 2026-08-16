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

pub mod encoding;
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
