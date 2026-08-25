//! RabbitMQ Streams (super streams) tuning — LAM-2024.
//!
//! Streams are the burst-absorption transport for span ingest: backlog lands on
//! broker disk instead of inflating broker memory, so a customer eval run can't
//! trip the memory alarm that blocks every publisher.

use super::{BoolEnv, NumEnv, StringEnv};

/// Master switch. Off ⇒ nothing in `mq::stream` is constructed and the
/// quorum-queue path is the only transport.
pub const ENABLED: BoolEnv = BoolEnv::new("RABBITMQ_STREAMS_ENABLED", false);

/// Whether the Quickwit indexing path may use streams. Read IDENTICALLY by the
/// producer (publisher registration) and consumer (reader spawn) pods, so the two
/// roles can never disagree about whether that stream has a reader.
///
/// Deliberately a config flag rather than "is my own `quickwit_client` live":
/// `QuickwitClient::connect` is a per-pod TCP dial, so a producer pod that
/// connects while a consumer pod doesn't would register the publisher with no
/// reader anywhere — and an unread stream is silently deleted by retention.
/// Config is the same in both Deployments, so the gate is symmetric by
/// construction. Set to false to keep indexing on the quorum queue.
pub const SPANS_INDEXER_ENABLED: BoolEnv =
    BoolEnv::new("RABBITMQ_STREAM_SPANS_INDEXER_ENABLED", true);

/// Stream-protocol endpoint. Separate from `RABBITMQ_URL` (AMQP 5672) because
/// the stream plugin listens on its own port and the client takes host/port,
/// not a URL.
pub const HOST: StringEnv = StringEnv::new("RABBITMQ_STREAM_HOST", "localhost");
pub const PORT: NumEnv<u16> = NumEnv::new("RABBITMQ_STREAM_PORT", 5552);
pub const USERNAME: StringEnv = StringEnv::new("RABBITMQ_STREAM_USERNAME", "guest");
pub const PASSWORD: StringEnv = StringEnv::new("RABBITMQ_STREAM_PASSWORD", "guest");
pub const VIRTUAL_HOST: StringEnv = StringEnv::new("RABBITMQ_STREAM_VIRTUAL_HOST", "/");
/// Set when the broker sits behind a load balancer — the client then re-resolves
/// leader/replica advertised hosts through the LB instead of dialing them directly.
pub const LOAD_BALANCER_MODE: BoolEnv = BoolEnv::new("RABBITMQ_STREAM_LOAD_BALANCER_MODE", false);

/// Partition count, fixed at creation. Hash routing is `murmur3(key) % n`, so
/// changing this re-maps every in-flight trace to a different partition and
/// breaks per-trace ordering — treat a change as a v2 super stream + drain
/// migration, never an in-place edit. Size ≥ max consumer pod count.
pub const PARTITIONS: NumEnv<usize> = NumEnv::new("RABBITMQ_STREAM_PARTITIONS", 128);

/// Retention, applied PER PARTITION (the creator passes one option map to every
/// partition), so the disk the super stream can occupy is
/// `PARTITIONS × MAX_LENGTH_BYTES` — raising either multiplies the total. Both
/// limits are evaluated per closed SEGMENT, and retention IGNORES consumer
/// offsets: segments a lagging group never read are still deleted, silently.
///
/// Size the PRODUCT against real node disk: with RF=3 every node holds every
/// partition, so cluster stream capacity is ONE node's free disk, not the sum.
/// The prod 400 GiB NVMe leaves ~250 GB after the `disk_free_limit` floor and
/// quorum-queue headroom, so 128 × 1.75 GiB ≈ 224 GiB — about 60 minutes of the
/// 4 GB/min peak. Keep that product under ~224 GiB when changing either value.
pub const MAX_LENGTH_BYTES: NumEnv<u64> =
    NumEnv::new("RABBITMQ_STREAM_MAX_LENGTH_BYTES", 1_879_048_192);
pub const MAX_AGE_SECS: NumEnv<u64> = NumEnv::new("RABBITMQ_STREAM_MAX_AGE_SECS", 43_200);
/// Smaller than the 500 MB broker default: retention only ever drops whole
/// closed segments, so 25 MB keeps expiry granularity fine relative to the
/// 1.75 GiB per-partition cap.
pub const MAX_SEGMENT_SIZE_BYTES: NumEnv<u64> =
    NumEnv::new("RABBITMQ_STREAM_MAX_SEGMENT_SIZE_BYTES", 26_214_400);

/// Replicas per partition, applied at creation via `x-initial-cluster-size`.
/// 2 (default) trades fault tolerance for ~1/3 less replication network/disk
/// work per node and ~1.5× cluster capacity: confirms need 2-of-2 members, so
/// one node down stalls its partitions' confirms and publishes fall back to
/// the quorum queue (the pre-streams status quo) until the member rejoins.
/// Deliberate bet: telemetry data, short retention, graceful fallback.
/// 3 = every node holds every partition and a single node loss is a non-event,
/// but cluster capacity is one node's disk and every byte is written 3×.
///
/// Placement caveat at RF < node count: the member set of each partition
/// always includes the node the declaring boot connection landed on, so that
/// node can end up a member of ALL partitions (leaders still spread via the
/// broker's `queue_leader_locator = balanced`). After first creation, check
/// members per partition (`rabbitmq-streams stream_status <partition>`) and
/// spread with `add_replica`/`delete_replica` if skewed.
pub const REPLICATION_FACTOR: NumEnv<usize> = NumEnv::new("RABBITMQ_STREAM_REPLICATION_FACTOR", 2);

/// How long a publish waits for the broker's confirmation before giving up and
/// letting the caller fall back to the quorum queue. Bounded because the client
/// does NOT invoke the confirm callback when the connection drops mid-flight —
/// without a ceiling that publish would hang forever on the ingest path.
pub const CONFIRM_TIMEOUT_MS: NumEnv<u64> =
    NumEnv::new("RABBITMQ_STREAM_CONFIRM_TIMEOUT_MS", 10_000);

/// Bounded queue depth between the per-partition readers and the batchers.
/// This is the backpressure knob: when full, readers stop granting credit and
/// the backlog stays on broker disk (exactly where we want it under burst).
///
/// NOTE: the client crate keeps its own delivery buffers UPSTREAM of this one —
/// one channel per partition plus one combined per super stream, 10000 records
/// each by default — which fill before this channel's backpressure reaches the
/// broker. Our fork (see Cargo.toml) makes them configurable via
/// `RABBITMQ_STREAM_CLIENT_CHANNEL_CAPACITY`, read directly by the crate (not
/// registered here as a descriptor — a `NumEnv` default would not affect it).
pub const CHANNEL_CAPACITY: NumEnv<usize> = NumEnv::new("RABBITMQ_STREAM_CHANNEL_CAPACITY", 256);

/// Batcher tasks per stream consumer, one env var per stream so they tune
/// independently. Partitions are assigned to batchers by
/// `partition_index % batchers` so a partition's offsets only ever advance from
/// one batcher — see `mq/stream/reader.rs`.
pub const SPANS_BATCHERS: NumEnv<usize> = NumEnv::new("RABBITMQ_STREAM_SPANS_BATCHERS", 4);
pub const SPANS_INDEXER_BATCHERS: NumEnv<usize> =
    NumEnv::new("RABBITMQ_STREAM_SPANS_INDEXER_BATCHERS", 4);
