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

use std::sync::{Arc, OnceLock};

pub mod publisher;
pub mod reader;
pub mod topology;

pub use publisher::StreamPublisher;
pub use reader::{StreamBatchHandler, StreamReader};
pub use topology::{StreamEnvironment, StreamTopology};

/// Super streams we own. The broker also creates an exchange of the same name;
/// partition streams are suffixed `-0..n-1` by the client.
pub const OBSERVATIONS_STREAM: &str = "observations_stream";
pub const SPANS_INDEXER_STREAM: &str = "spans_indexer_stream";

/// Consumer group names. This is the `reference` broker-side offset tracking is
/// keyed by, so renaming one makes the group resume from scratch — treat these as
/// persistent identifiers, not labels.
pub const OBSERVATIONS_CONSUMER_NAME: &str = "observations_workers";
pub const SPANS_INDEXER_CONSUMER_NAME: &str = "spans_indexer_workers";

/// Boot-time publisher registry.
///
/// Producers are reached from ~10 call sites (`publish_span_messages`,
/// `publish_for_indexing`, and everything upstream of them) that already thread
/// `Arc<MessageQueue>`; threading a second optional handle through all of them —
/// including the `Pin<Box<dyn Future>>` metadata façades — would be a large
/// mechanical diff for a transport that is off by default. Same `OnceLock`
/// pattern as `llm::set_llm_client_available`: `main` sets it once after
/// construction, and until then (tests, LITE, streams disabled) every publisher
/// resolves to `None` and callers take the AMQP path.
static OBSERVATIONS_PUBLISHER: OnceLock<Arc<StreamPublisher>> = OnceLock::new();
static SPANS_INDEXER_PUBLISHER: OnceLock<Arc<StreamPublisher>> = OnceLock::new();

pub fn set_observations_publisher(publisher: Arc<StreamPublisher>) {
    let _ = OBSERVATIONS_PUBLISHER.set(publisher);
}

pub fn observations_publisher() -> Option<&'static Arc<StreamPublisher>> {
    OBSERVATIONS_PUBLISHER.get()
}

pub fn set_spans_indexer_publisher(publisher: Arc<StreamPublisher>) {
    let _ = SPANS_INDEXER_PUBLISHER.set(publisher);
}

pub fn spans_indexer_publisher() -> Option<&'static Arc<StreamPublisher>> {
    SPANS_INDEXER_PUBLISHER.get()
}

/// Whether the streams transport is configured. Publishers additionally gate on
/// their own `OnceLock` being set, so a failed connect at boot degrades to AMQP
/// rather than dropping data.
pub fn enabled() -> bool {
    crate::env::streams::ENABLED.get()
}
