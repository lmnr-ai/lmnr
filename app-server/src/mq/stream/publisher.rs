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
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::{Context, Result, anyhow};
use rabbitmq_stream_client::{
    NoDedup,
    types::{HashRoutingMurmurStrategy, Message, RoutingStrategy, SuperStreamProducer},
};
use serde::Serialize;
use tokio::sync::{Mutex, oneshot};

use super::topology::StreamEnvironment;
use crate::env;

/// Application property carrying the partition key. The routing extractor is a
/// `&'static` fn in the client API, so the key has to travel on the message
/// rather than being closed over per call.
const PARTITION_KEY: &str = "lmnr.partition_key";

/// Headroom reserved for everything around the body inside a Publish frame:
/// frame header, publisher id, publishing id, AMQP 1.0 message encoding, and
/// the partition-key application property. Generous on purpose — the real
/// overhead is a few hundred bytes.
const FRAME_OVERHEAD_BYTES: usize = 16 * 1024;

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

    /// Publish one record, routed by `key`, and AWAIT the broker's confirmation.
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
    pub async fn publish<T: Serialize>(&self, payload: &T, key: &str) -> Result<()> {
        let body = serde_json::to_vec(payload).context("Failed to serialize stream payload")?;

        // Size gate: an over-limit frame is fatal, not just rejected — the
        // broker closes the connection with a `FrameTooLarge` close frame that
        // the 0.11 client mis-parses (decoder desync), killing this producer
        // until process restart. Erroring here instead routes the payload to
        // the quorum-queue fallback, which has no such frame cap.
        let max_frame = env::streams::MAX_FRAME_BYTES.get() as usize;
        if body.len() + FRAME_OVERHEAD_BYTES > max_frame {
            return Err(anyhow!(
                "Stream payload of {} bytes exceeds the {} byte frame limit for '{}'",
                body.len(),
                max_frame,
                self.super_stream
            ));
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
            self.mark_unhealthy("send failed");
            return Err(anyhow::Error::from(e))
                .with_context(|| format!("Failed to publish to '{}'", super_stream));
        }

        let timeout = Duration::from_millis(env::streams::CONFIRM_TIMEOUT_MS.get());
        match tokio::time::timeout(timeout, confirm_rx).await {
            Ok(Ok(Ok(()))) => Ok(()),
            Ok(Ok(Err(failure))) => {
                if failure.fatal {
                    self.mark_unhealthy("client error on confirmation");
                }
                Err(anyhow!(
                    "Stream publish to '{}' was not confirmed: {}",
                    super_stream,
                    failure.reason
                ))
            }
            // Sender dropped without confirming — the producer was closed.
            Ok(Err(_)) => {
                self.mark_unhealthy("confirmation channel lost");
                Err(anyhow!(
                    "Stream publish to '{}' lost its confirmation channel",
                    super_stream
                ))
            }
            Err(_) => {
                // A live connection delivers confirms in milliseconds; hitting
                // the ceiling means the connection silently died (the client
                // never calls the callback for in-flight messages on drop).
                self.mark_unhealthy("confirmation timeout");
                Err(anyhow!(
                    "Stream publish to '{}' was not confirmed within {:?}",
                    super_stream,
                    timeout
                ))
            }
        }
    }

    fn mark_unhealthy(&self, why: &str) {
        // swap → log only on the true→false transition, not on every failure.
        if self.healthy.swap(false, Ordering::AcqRel) {
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

        self.healthy.store(true, Ordering::Release);
        log::info!("Rebuilt stream producer for '{}'", self.super_stream);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::topology::StreamTopology;
    use super::*;

    const TEST_STREAM: &str = "lmnr_test_publisher_rebuild";

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
        let publisher = StreamPublisher::new(&environment, TEST_STREAM).await.unwrap();
        eprintln!("[test] baseline publish");
        publisher
            .publish(&serde_json::json!({"n": 1}), "k1")
            .await
            .expect("baseline publish should succeed");

        // Simulate a detected connection death (the publish arms flip this on
        // fatal confirm failures / timeouts / send errors).
        publisher.mark_unhealthy("test");
        assert!(!publisher.healthy.load(Ordering::Acquire));

        // The next publish must rebuild inline and go through.
        eprintln!("[test] publish after mark_unhealthy (expect rebuild)");
        publisher
            .publish(&serde_json::json!({"n": 2}), "k2")
            .await
            .expect("publish should rebuild the producer and succeed");
        assert!(publisher.healthy.load(Ordering::Acquire));

        // A failure right after a rebuild attempt fails FAST (cooldown), so a
        // hard-down broker costs one connect per window, not one per publish.
        publisher.mark_unhealthy("test again");
        let err = publisher
            .publish(&serde_json::json!({"n": 3}), "k3")
            .await
            .expect_err("cooldown should fail fast without rebuilding");
        assert!(
            err.to_string().contains("next rebuild attempt"),
            "unexpected error: {err}"
        );
    }
}
