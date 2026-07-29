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
pub const PARTITIONS: NumEnv<usize> = NumEnv::new("RABBITMQ_STREAM_PARTITIONS", 32);

/// Per-partition retention. Both are evaluated per closed SEGMENT, and
/// retention IGNORES consumer offsets — segments a lagging group never read are
/// still deleted, silently. Size `MAX_LENGTH_BYTES` against real node disk:
/// with RF=3 every node holds every partition, so cluster stream capacity is
/// ONE node's free disk, not the sum. 32 × 7 GiB ≈ 224 GiB fits the prod
/// 400 GiB NVMe minus the `disk_free_limit` floor and quorum-queue headroom.
pub const MAX_LENGTH_BYTES: NumEnv<u64> =
    NumEnv::new("RABBITMQ_STREAM_MAX_LENGTH_BYTES", 7_516_192_768);
pub const MAX_AGE_SECS: NumEnv<u64> = NumEnv::new("RABBITMQ_STREAM_MAX_AGE_SECS", 14_400);
/// Smaller than the 500 MB broker default: retention only ever drops whole
/// closed segments, so 100 MB keeps expiry granularity fine relative to the
/// 7 GiB per-partition cap.
pub const MAX_SEGMENT_SIZE_BYTES: NumEnv<u64> =
    NumEnv::new("RABBITMQ_STREAM_MAX_SEGMENT_SIZE_BYTES", 104_857_600);

/// Replicas per partition, applied at creation via `x-initial-cluster-size`.
/// 3 (default) = every node holds every partition: survives node loss, but
/// cluster capacity is one node's disk. 2 = survives single-node loss with ~1.5×
/// capacity. 1 = capacity is the SUM of node disks but a destroyed disk loses
/// that partition's un-flushed backlog — a durability downgrade vs the quorum
/// queue we're replacing, so it needs an explicit decision, not a default.
pub const REPLICATION_FACTOR: NumEnv<usize> = NumEnv::new("RABBITMQ_STREAM_REPLICATION_FACTOR", 3);

/// How long a publish waits for the broker's confirmation before giving up and
/// letting the caller fall back to the quorum queue. Bounded because the client
/// does NOT invoke the confirm callback when the connection drops mid-flight —
/// without a ceiling that publish would hang forever on the ingest path.
pub const CONFIRM_TIMEOUT_MS: NumEnv<u64> =
    NumEnv::new("RABBITMQ_STREAM_CONFIRM_TIMEOUT_MS", 10_000);

/// Bounded queue depth between the per-partition readers and the batchers.
/// This is the backpressure knob: when full, readers stop granting credit and
/// the backlog stays on broker disk (exactly where we want it under burst).
pub const CHANNEL_CAPACITY: NumEnv<usize> = NumEnv::new("RABBITMQ_STREAM_CHANNEL_CAPACITY", 256);

/// Batcher tasks per stream consumer. Partitions are assigned to batchers by
/// `partition_index % batchers` so a partition's offsets only ever advance from
/// one batcher — see `mq/stream/reader.rs`.
pub const BATCHERS: NumEnv<usize> = NumEnv::new("RABBITMQ_STREAM_BATCHERS", 4);
