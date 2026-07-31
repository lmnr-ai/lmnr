//! Super-stream publisher: hash-routed by partition key, one message per record.
//!
//! Routing key choice matters. `trace_id` spreads a single customer's burst
//! across every partition while keeping one trace's spans on ONE partition —
//! which is what gives us per-trace ordering and a single writer for the
//! Postgres trace upsert. Routing by `project_id` would funnel a bursting
//! customer's whole eval run into one partition and rebuild the hotspot this
//! migration exists to remove.
//!
//! Self-healing: the client's `SuperStreamProducer` caches one `Producer` per
//! partition in a HashMap forever — no health check, no reconnect — so a dead
//! connection is permanent from the crate's point of view. This wrapper owns
//! recovery: fatal publish failures flip `healthy` off, and the next publish
//! rebuilds the whole producer (single-flight, cooldown-throttled) while
//! concurrent publishes fail fast to the quorum-queue fallback.

use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::{Context, Result, anyhow};
use rabbitmq_stream_client::{
    NoDedup,
    types::{HashRoutingMurmurStrategy, Message, RoutingStrategy, SuperStreamProducer},
};
use tokio::sync::{Mutex, oneshot};

use super::topology::StreamEnvironment;
use crate::env;

/// Application property carrying the partition key. The routing extractor is a
/// `&'static` fn in the client API, so the key has to travel on the message
/// rather than being closed over per call.
const PARTITION_KEY: &str = "lmnr.partition_key";

/// Minimum spacing between rebuild attempts, so a hard-down broker costs one
/// bounded connect attempt per window instead of one per publish.
const REBUILD_COOLDOWN: Duration = Duration::from_secs(5);

/// Ceiling on a single rebuild attempt. Without it an unreachable broker makes
/// the rebuilding publish hang in TCP connect while its export call waits.
const REBUILD_TIMEOUT: Duration = Duration::from_secs(5);

fn partition_key(message: &Message) -> String {
    message
        .application_properties()
        .and_then(|props| props.get(PARTITION_KEY))
        .and_then(|value| String::try_from(value.clone()).ok())
        .unwrap_or_default()
}

/// One published record's byte ceiling — the stream memory bound, read once.
pub fn max_record_bytes() -> usize {
    static CAP: std::sync::LazyLock<usize> =
        std::sync::LazyLock::new(|| env::streams::MAX_PUBLISH_BYTES.get());
    *CAP
}

/// A payload over the record cap. Typed so callers can tell "split or fall
/// back" apart from connection failures (which warrant a rebuild + error log).
#[derive(Debug)]
pub struct PayloadTooLarge {
    pub size: usize,
    pub cap: usize,
}

impl std::fmt::Display for PayloadTooLarge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "stream payload of {} bytes exceeds the {}-byte record cap",
            self.size, self.cap
        )
    }
}

impl std::error::Error for PayloadTooLarge {}

/// Greedy-pack individually serialized JSON values into `[...]` array bodies
/// of at most `cap` bytes each. Byte-identical to `serde_json::to_vec` of the
/// corresponding sub-slices, so consumers deserialize chunks exactly like
/// whole batches. `None` when any single part can't fit even alone — the
/// caller falls back to the queue for the whole batch.
pub fn pack_json_array_chunks(parts: &[Vec<u8>], cap: usize) -> Option<Vec<Vec<u8>>> {
    let mut chunks: Vec<Vec<u8>> = Vec::new();
    let mut current: Vec<u8> = Vec::new();

    for part in parts {
        // "[" + part + "]"
        if part.len() + 2 > cap {
            return None;
        }
        // Appending to the open chunk costs a "," separator; +1 closes "]".
        if !current.is_empty() && current.len() + 1 + part.len() + 1 > cap {
            current.push(b']');
            chunks.push(std::mem::take(&mut current));
        }
        current.push(if current.is_empty() { b'[' } else { b',' });
        current.extend_from_slice(part);
    }

    if !current.is_empty() {
        current.push(b']');
        chunks.push(current);
    }
    Some(chunks)
}

/// A failed confirmation, split by what it says about the connection.
/// `fatal` = the client reported an error or the confirm never arrived — the
/// producer's connection is gone and a rebuild is warranted. A broker
/// REJECTION (`fatal: false`) proves the connection is alive and must NOT
/// trigger a rebuild.
struct ConfirmFailure {
    reason: String,
    fatal: bool,
}

/// Publishes to one super stream. `send` is `&mut self` in the client, so the
/// producer sits behind a mutex — the lock is held only long enough to enqueue
/// into the client's internal batching channel, not for the broker round trip.
pub struct StreamPublisher {
    producer: Mutex<SuperStreamProducer<NoDedup>>,
    environment: StreamEnvironment,
    super_stream: &'static str,
    /// Flipped off by fatal failures; back on after a successful rebuild.
    /// While off, publishes fail fast (no send, no confirm wait) so the
    /// fallback path isn't taxed the full `CONFIRM_TIMEOUT_MS` per call.
    healthy: AtomicBool,
    /// Bumped once per successful rebuild, and the reason `mark_unhealthy` is
    /// generation-scoped.
    ///
    /// A publish can outlive the producer it was sent on: its confirm wait runs
    /// for up to `CONFIRM_TIMEOUT_MS`, during which another caller may rebuild.
    /// The old producer's confirms then fail (its connection is dead / closed by
    /// the rebuild), and an unguarded `mark_unhealthy` would flip the BRAND-NEW
    /// producer unhealthy — and because a rebuild stamps the cooldown, the next
    /// publish can't rebuild again either, so every publish falls back to the
    /// quorum queue for a whole `REBUILD_COOLDOWN` window despite a working
    /// connection. Each publish captures the generation before sending and its
    /// failures are ignored if a rebuild has since moved it on.
    generation: AtomicU64,
    /// Single-flight gate + cooldown clock for rebuilds. `try_lock` losers
    /// fail fast while the winner rebuilds.
    rebuild_gate: Mutex<Option<Instant>>,
}

impl StreamPublisher {
    pub async fn new(environment: &StreamEnvironment, super_stream: &'static str) -> Result<Self> {
        let producer = Self::build_producer(environment, super_stream).await?;

        Ok(Self {
            producer: Mutex::new(producer),
            environment: environment.clone(),
            super_stream,
            healthy: AtomicBool::new(true),
            generation: AtomicU64::new(0),
            rebuild_gate: Mutex::new(None),
        })
    }

    async fn build_producer(
        environment: &StreamEnvironment,
        super_stream: &'static str,
    ) -> Result<SuperStreamProducer<NoDedup>> {
        environment
            .inner()
            .super_stream_producer(RoutingStrategy::HashRoutingStrategy(
                HashRoutingMurmurStrategy {
                    routing_extractor: &partition_key,
                },
            ))
            .client_provided_name(&format!("lmnr-{}-producer", super_stream))
            .build(super_stream)
            .await
            .with_context(|| format!("Failed to build producer for '{}'", super_stream))
    }

    /// Publish one already-serialized JSON record, routed by `key`, and AWAIT
    /// the broker's confirmation. Takes bytes rather than `&T: Serialize`
    /// because every caller serializes anyway (the spans path builds the
    /// queue-fallback payload up front) — a generic `publish<T>` would pay a
    /// second serialization.
    ///
    /// Returning `Ok` on enqueue alone would be silent data loss: every caller
    /// treats `Ok` as durable and skips the quorum-queue fallback, so a nack or a
    /// disconnect after enqueue would drop the payload with an HTTP 200 and no
    /// queue copy. The AMQP path awaits its publisher confirm for the same
    /// reason, so this keeps the two transports' durability equivalent.
    ///
    /// The wait is bounded (`CONFIRM_TIMEOUT_MS`) because the client does NOT
    /// invoke the callback for messages still awaiting confirmation when the
    /// connection drops — it hands them to an `on_closed` handler we don't set,
    /// so an unbounded wait would hang ingest. A timeout is reported as an error
    /// so the caller falls back; the record may still land, which makes the
    /// fallback a duplicate rather than a loss (the consumer is already
    /// at-least-once).
    pub async fn publish_raw(&self, body: Vec<u8>, key: &str) -> Result<()> {
        // The record cap is the stream memory bound (see MAX_PUBLISH_BYTES in
        // env/streams.rs): per-partition codec buffers ratchet to the largest
        // frame ever carried. Checked BEFORE the health machinery — an
        // oversized payload says nothing about the connection, and the typed
        // error lets callers split or fall back without a rebuild.
        if body.len() > max_record_bytes() {
            return Err(PayloadTooLarge {
                size: body.len(),
                cap: max_record_bytes(),
            }
            .into());
        }

        // A producer known to be dead fails fast; one caller per cooldown
        // window pays for the rebuild attempt inline.
        if !self.healthy.load(Ordering::Acquire) {
            self.try_rebuild().await?;
        }

        let message = Message::builder()
            .body(body)
            .application_properties()
            .insert(PARTITION_KEY, key.to_string())
            .message_builder()
            .build();

        // The hash strategy resolves to exactly one partition, so exactly one
        // confirmation arrives per publish.
        let (confirm_tx, confirm_rx) = oneshot::channel();
        let confirm_tx = Arc::new(Mutex::new(Some(confirm_tx)));

        let super_stream = self.super_stream;
        // Read BEFORE sending: any failure this publish reports belongs to this
        // producer, and must not condemn a replacement built while we waited.
        let generation = self.generation.load(Ordering::Acquire);
        let send_result = {
            let mut producer = self.producer.lock().await;
            producer
                .send(message, move |confirm| {
                    let confirm_tx = confirm_tx.clone();
                    async move {
                        let outcome = match confirm {
                            Ok(status) if status.confirmed() => Ok(()),
                            Ok(status) => Err(ConfirmFailure {
                                reason: format!("broker rejected: {:?}", status.status()),
                                fatal: false,
                            }),
                            Err(e) => Err(ConfirmFailure {
                                reason: format!("{:?}", e),
                                fatal: true,
                            }),
                        };
                        // Only the first confirmation is meaningful; a receiver
                        // dropped by timeout makes the send a no-op.
                        if let Some(tx) = confirm_tx.lock().await.take() {
                            let _ = tx.send(outcome);
                        }
                    }
                })
                .await
        };

        if let Err(e) = send_result {
            // Covers both a dead connection and a failed lazy per-partition
            // producer creation inside the client — connection trouble either
            // way.
            self.mark_unhealthy(generation, "send failed");
            return Err(anyhow::Error::from(e))
                .with_context(|| format!("Failed to publish to '{}'", super_stream));
        }

        let timeout = Duration::from_millis(env::streams::CONFIRM_TIMEOUT_MS.get());
        match tokio::time::timeout(timeout, confirm_rx).await {
            Ok(Ok(Ok(()))) => Ok(()),
            Ok(Ok(Err(failure))) => {
                if failure.fatal {
                    self.mark_unhealthy(generation, "client error on confirmation");
                }
                Err(anyhow!(
                    "Stream publish to '{}' was not confirmed: {}",
                    super_stream,
                    failure.reason
                ))
            }
            // Sender dropped without confirming — the producer was closed.
            Ok(Err(_)) => {
                self.mark_unhealthy(generation, "confirmation channel lost");
                Err(anyhow!(
                    "Stream publish to '{}' lost its confirmation channel",
                    super_stream
                ))
            }
            Err(_) => {
                // A live connection delivers confirms in milliseconds; hitting
                // the ceiling means the connection silently died (the client
                // never calls the callback for in-flight messages on drop).
                self.mark_unhealthy(generation, "confirmation timeout");
                Err(anyhow!(
                    "Stream publish to '{}' was not confirmed within {:?}",
                    super_stream,
                    timeout
                ))
            }
        }
    }

    /// Mark the producer dead — but only if `generation` is still the live one.
    ///
    /// A stale generation means a rebuild already replaced the producer this
    /// failure came from, so the failure says nothing about the current one.
    fn mark_unhealthy(&self, generation: u64, why: &str) {
        if !condemn_if_current(&self.healthy, &self.generation, generation) {
            log::debug!(
                "Ignoring stale failure from a superseded stream producer for '{}' ({}), or it was already unhealthy",
                self.super_stream,
                why
            );
            return;
        }
        {
            log::warn!(
                "Stream producer for '{}' marked unhealthy ({}); publishes fall back to the queue until a rebuild succeeds",
                self.super_stream,
                why
            );
        }
    }

    /// Replace the dead producer with a freshly built one.
    ///
    /// Single-flight: the `rebuild_gate` holder is the only caller doing the
    /// (bounded) connect; concurrent publishes fail straight to the fallback.
    /// The cooldown is stamped at attempt START, so a hard-down broker costs
    /// one `REBUILD_TIMEOUT` connect per `REBUILD_COOLDOWN` window.
    async fn try_rebuild(&self) -> Result<()> {
        let mut last_attempt = self.rebuild_gate.try_lock().map_err(|_| {
            anyhow!(
                "Stream producer for '{}' is down; a rebuild is already in flight",
                self.super_stream
            )
        })?;

        if let Some(at) = *last_attempt
            && at.elapsed() < REBUILD_COOLDOWN
        {
            return Err(anyhow!(
                "Stream producer for '{}' is down; next rebuild attempt in {:?}",
                self.super_stream,
                REBUILD_COOLDOWN - at.elapsed()
            ));
        }
        *last_attempt = Some(Instant::now());

        let new_producer = tokio::time::timeout(
            REBUILD_TIMEOUT,
            Self::build_producer(&self.environment, self.super_stream),
        )
        .await
        .map_err(|_| {
            anyhow!(
                "Rebuild of stream producer for '{}' timed out after {:?}",
                self.super_stream,
                REBUILD_TIMEOUT
            )
        })??;

        let old = {
            let mut producer = self.producer.lock().await;
            std::mem::replace(&mut *producer, new_producer)
        };
        // Close the old producer off the publish path: its connection is
        // usually already dead, so this exists to release any still-live
        // client resources, and errors are meaningless.
        tokio::spawn(async move {
            let _ = tokio::time::timeout(Duration::from_secs(5), old.close()).await;
        });

        // Bump BEFORE re-arming `healthy`: any in-flight publish on the old
        // producer now carries a stale generation, so its late failure is
        // ignored instead of condemning this fresh producer.
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.healthy.store(true, Ordering::Release);
        log::info!("Rebuilt stream producer for '{}'", self.super_stream);
        Ok(())
    }
}

/// Flip `healthy` false only when `publish_generation` is still the live
/// generation. Returns whether THIS call performed the true→false transition, so
/// the caller logs once per transition rather than once per failure.
///
/// Free function so the guard is unit-testable without a live broker (building a
/// `StreamPublisher` requires one).
fn condemn_if_current(
    healthy: &AtomicBool,
    generation: &AtomicU64,
    publish_generation: u64,
) -> bool {
    if generation.load(Ordering::Acquire) != publish_generation {
        return false;
    }
    healthy.swap(false, Ordering::AcqRel)
}

#[cfg(test)]
mod tests {
    use super::super::topology::StreamTopology;
    use super::*;

    const TEST_STREAM: &str = "lmnr_test_publisher_rebuild";

    /// Chunks must deserialize exactly like `serde_json::to_vec` of the
    /// corresponding sub-slices — the consumer treats every record as a plain
    /// `Vec<T>` and has no idea splitting happened.
    #[test]
    fn packed_chunks_round_trip_and_respect_the_cap() {
        let values: Vec<serde_json::Value> = (0..20)
            .map(|i| serde_json::json!({"id": i, "body": "x".repeat(i * 7)}))
            .collect();
        let parts: Vec<Vec<u8>> = values
            .iter()
            .map(|v| serde_json::to_vec(v).unwrap())
            .collect();

        let cap = 256;
        let chunks = pack_json_array_chunks(&parts, cap).unwrap();
        assert!(chunks.len() > 1, "cap should force a split");

        let mut reassembled: Vec<serde_json::Value> = Vec::new();
        for chunk in &chunks {
            assert!(
                chunk.len() <= cap,
                "chunk of {} bytes over cap",
                chunk.len()
            );
            let parsed: Vec<serde_json::Value> = serde_json::from_slice(chunk)
                .expect("every chunk must be a well-formed JSON array");
            assert!(!parsed.is_empty());
            reassembled.extend(parsed);
        }
        assert_eq!(reassembled, values, "no value lost, reordered, or altered");
    }

    #[test]
    fn everything_fits_in_one_chunk_under_a_large_cap() {
        let parts: Vec<Vec<u8>> = (0..5).map(|i| format!("{i}").into_bytes()).collect();
        let chunks = pack_json_array_chunks(&parts, 1024).unwrap();
        assert_eq!(chunks.len(), 1);
        let parsed: Vec<u8> = serde_json::from_slice(&chunks[0]).unwrap();
        assert_eq!(parsed, vec![0, 1, 2, 3, 4]);
    }

    /// A single unsplittable over-cap part means the whole batch takes the
    /// queue path — never a truncated or over-cap chunk.
    #[test]
    fn an_oversized_single_part_refuses_to_pack() {
        let parts = vec![b"1".to_vec(), vec![b'9'; 300], b"2".to_vec()];
        assert!(pack_json_array_chunks(&parts, 256).is_none());
    }

    #[test]
    fn empty_input_packs_to_no_chunks() {
        assert_eq!(pack_json_array_chunks(&[], 256), Some(vec![]));
    }

    /// A publish's confirm wait can outlive the producer it was sent on, so a
    /// late failure from a SUPERSEDED producer must not condemn the replacement.
    /// Without the generation guard this flips `healthy` false on a freshly
    /// rebuilt producer AND the rebuild cooldown is already stamped, so every
    /// publish falls back to the quorum queue for the whole cooldown window.
    ///
    /// Exercises the real `condemn_if_current` (the guard `mark_unhealthy` calls);
    /// constructing a `StreamPublisher` would need a live broker.
    #[test]
    fn a_stale_generation_failure_cannot_condemn_a_rebuilt_producer() {
        let healthy = AtomicBool::new(true);
        let generation = AtomicU64::new(0);

        // A publish starts on generation 0, then a concurrent rebuild lands.
        let publish_generation = generation.load(Ordering::Acquire);
        generation.fetch_add(1, Ordering::AcqRel);
        healthy.store(true, Ordering::Release);

        // The old publish's confirm fails only now.
        assert!(
            !condemn_if_current(&healthy, &generation, publish_generation),
            "a superseded generation must not report a transition"
        );
        assert!(
            healthy.load(Ordering::Acquire),
            "a superseded producer's failure must leave the rebuilt producer healthy"
        );

        // A failure on the CURRENT generation still condemns it, once.
        let current = generation.load(Ordering::Acquire);
        assert!(condemn_if_current(&healthy, &generation, current));
        assert!(!healthy.load(Ordering::Acquire));
        assert!(
            !condemn_if_current(&healthy, &generation, current),
            "already-unhealthy must not re-report a transition (keeps the log to one line)"
        );
    }

    /// Leak probe (LAM-2024 prod OOM): three publish phases that split the
    /// hypothesis space using in-process jemalloc counters — the same numbers
    /// the prod memory-stats logger prints, on the same allocator.
    ///
    /// - Phase A: thousands of constant ~64KB publishes. Warm-up; expect a
    ///   plateau once every partition connection has been touched.
    /// - Phase B: a few 4MB outliers. If per-connection codec buffers ratchet
    ///   to the largest frame ever seen, `allocated` steps up by roughly
    ///   (partitions touched × frame size) and STAYS there.
    /// - Phase C: constant 64KB traffic again, long. If `allocated` keeps
    ///   climbing HERE, something retains memory per publish — a genuine
    ///   leak, not a ratchet.
    ///
    /// Diagnostic, not pass/fail — read the printed deltas. Needs a local
    /// broker with the stream plugin on 5552. Run with:
    /// `cargo test --bin app-server mq::stream::publisher::tests::publish_leak_probe -- --ignored --nocapture`
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore]
    async fn publish_leak_probe() {
        use std::sync::Arc;

        use futures_util::stream::{self, StreamExt};

        fn sample(label: &str) {
            use tikv_jemalloc_ctl::{epoch, stats};
            epoch::advance().unwrap();
            let allocated = stats::allocated::read().unwrap() as f64 / 1048576.0;
            let resident = stats::resident::read().unwrap() as f64 / 1048576.0;
            eprintln!("[{label:<24}] allocated={allocated:>8.1} MB  resident={resident:>8.1} MB");
        }

        /// JSON array of ~1KB spans, `kb` kilobytes total — shaped like a
        /// span-batch export.
        fn payload_of_kb(kb: usize) -> serde_json::Value {
            serde_json::Value::Array(
                (0..kb)
                    .map(|i| {
                        serde_json::json!({
                            "span_id": format!("{:032x}", i),
                            "name": "gen_ai.chat",
                            "input": format!("some repeated prompt text {i} ").repeat(32),
                        })
                    })
                    .collect(),
            )
        }

        async fn publish_wave(
            publisher: &Arc<StreamPublisher>,
            body: &Arc<Vec<u8>>,
            count: usize,
            concurrency: usize,
        ) {
            stream::iter(0..count)
                .map(|_| {
                    let publisher = publisher.clone();
                    let body = body.clone();
                    async move {
                        publisher
                            .publish_raw((*body).clone(), &uuid::Uuid::now_v7().to_string())
                            .await
                            .expect("publish failed");
                    }
                })
                .buffer_unordered(concurrency)
                .collect::<Vec<_>>()
                .await;
        }

        let environment = StreamEnvironment::connect()
            .await
            .expect("local stream broker not reachable");
        let topology = StreamTopology {
            partitions: 16,
            max_length_bytes: 500_000_000,
            max_age: Duration::from_secs(600),
            max_segment_size_bytes: 50_000_000,
            replication_factor: 1,
        };
        topology
            .declare(&environment, "lmnr_test_leak_probe")
            .await
            .unwrap();

        let publisher = Arc::new(
            StreamPublisher::new(&environment, "lmnr_test_leak_probe")
                .await
                .unwrap(),
        );

        let small = Arc::new(serde_json::to_vec(&payload_of_kb(64)).unwrap());
        let large = payload_of_kb(4096);

        sample("baseline");

        // Phase A: warm-up at constant size.
        for chunk in 1..=3 {
            publish_wave(&publisher, &small, 1000, 32).await;
            sample(&format!("A: {}k x 64KB", chunk));
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
        sample("A settled");

        // Phase B: a handful of 4MB outliers to hit every partition —
        // published the way the spans producer does, split into record-cap
        // chunks. Publishing these as single 4MB frames permanently pinned
        // +36MB here (the ratchet, measured pre-fix); chunked, the step must
        // stay bounded by partitions × cap no matter how large the batch.
        let serde_json::Value::Array(items) = large else {
            unreachable!()
        };
        let parts: Vec<Vec<u8>> = items
            .iter()
            .map(|v| serde_json::to_vec(v).unwrap())
            .collect();
        let chunks = pack_json_array_chunks(&parts, max_record_bytes()).unwrap();
        eprintln!(
            "4MB batch -> {} chunks under the {}-byte cap",
            chunks.len(),
            max_record_bytes()
        );
        for _ in 0..32 {
            let key = uuid::Uuid::now_v7().to_string();
            for chunk in &chunks {
                publisher
                    .publish_raw(chunk.clone(), &key)
                    .await
                    .expect("chunk publish failed");
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
        sample("B settled: 32 x 4MB");

        // Phase B2: 16MB whales, still chunked. If the cap is the real bound,
        // 4x larger batches add ~nothing — the buffers already sit at their
        // cap-sized high-water mark.
        let serde_json::Value::Array(whale_items) = payload_of_kb(16 * 1024) else {
            unreachable!()
        };
        let whale_parts: Vec<Vec<u8>> = whale_items
            .iter()
            .map(|v| serde_json::to_vec(v).unwrap())
            .collect();
        let whale_chunks = pack_json_array_chunks(&whale_parts, max_record_bytes()).unwrap();
        for _ in 0..8 {
            let key = uuid::Uuid::now_v7().to_string();
            for chunk in &whale_chunks {
                publisher
                    .publish_raw(chunk.clone(), &key)
                    .await
                    .expect("whale chunk publish failed");
            }
        }
        drop((whale_items, whale_parts, whale_chunks));
        tokio::time::sleep(Duration::from_secs(3)).await;
        sample("B2 settled: 8 x 16MB");

        // Phase C: back to constant size. Climb here = real leak.
        for chunk in 1..=5 {
            publish_wave(&publisher, &small, 1000, 32).await;
            sample(&format!("C: {}k x 64KB", chunk));
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
        sample("final settled");
    }

    /// Needs a local broker with the stream plugin on 5552 (guest/guest), so
    /// it's ignored by default. Run with:
    /// `cargo test --bin app-server mq::stream::publisher -- --ignored`
    ///
    /// `multi_thread` is REQUIRED: the rabbitmq-stream-client deadlocks on the
    /// default current-thread test runtime (the handshake never completes and
    /// the broker eventually heartbeat-closes the socket while the client
    /// awaits forever).
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore]
    async fn rebuild_recovers_an_unhealthy_publisher() {
        eprintln!("[test] connecting");
        let environment = StreamEnvironment::connect()
            .await
            .expect("local stream broker not reachable");
        eprintln!("[test] declaring super stream");
        let topology = StreamTopology {
            partitions: 2,
            max_length_bytes: 10_000_000,
            max_age: Duration::from_secs(600),
            max_segment_size_bytes: 1_000_000,
            replication_factor: 1,
        };
        topology.declare(&environment, TEST_STREAM).await.unwrap();

        eprintln!("[test] building publisher");
        let publisher = StreamPublisher::new(&environment, TEST_STREAM)
            .await
            .unwrap();
        eprintln!("[test] baseline publish");
        publisher
            .publish_raw(serde_json::to_vec(&serde_json::json!({"n": 1})).unwrap(), "k1")
            .await
            .expect("baseline publish should succeed");

        // Simulate a detected connection death (the publish arms flip this on
        // fatal confirm failures / timeouts / send errors).
        publisher.mark_unhealthy(publisher.generation.load(Ordering::Acquire), "test");
        assert!(!publisher.healthy.load(Ordering::Acquire));

        // The next publish must rebuild inline and go through.
        eprintln!("[test] publish after mark_unhealthy (expect rebuild)");
        publisher
            .publish_raw(serde_json::to_vec(&serde_json::json!({"n": 2})).unwrap(), "k2")
            .await
            .expect("publish should rebuild the producer and succeed");
        assert!(publisher.healthy.load(Ordering::Acquire));

        // A failure right after a rebuild attempt fails FAST (cooldown), so a
        // hard-down broker costs one connect per window, not one per publish.
        publisher.mark_unhealthy(publisher.generation.load(Ordering::Acquire), "test again");
        let err = publisher
            .publish_raw(serde_json::to_vec(&serde_json::json!({"n": 3})).unwrap(), "k3")
            .await
            .expect_err("cooldown should fail fast without rebuilding");
        assert!(
            err.to_string().contains("next rebuild attempt"),
            "unexpected error: {err}"
        );
    }
}
