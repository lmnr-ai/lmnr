//! Super-stream publisher: hash-routed by partition key, one message per record.
//!
//! Routing key choice matters. `trace_id` spreads a single customer's burst
//! across every partition while keeping one trace's spans on ONE partition —
//! which is what gives us per-trace ordering and a single writer for the
//! Postgres trace upsert. Routing by `project_id` would funnel a bursting
//! customer's whole eval run into one partition and rebuild the hotspot this
//! migration exists to remove.

use std::{sync::Arc, time::Duration};

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

fn partition_key(message: &Message) -> String {
    message
        .application_properties()
        .and_then(|props| props.get(PARTITION_KEY))
        .and_then(|value| String::try_from(value.clone()).ok())
        .unwrap_or_default()
}

/// Publishes to one super stream. `send` is `&mut self` in the client, so the
/// producer sits behind a mutex — the lock is held only long enough to enqueue
/// into the client's internal batching channel, not for the broker round trip.
pub struct StreamPublisher {
    producer: Mutex<SuperStreamProducer<NoDedup>>,
    super_stream: &'static str,
}

impl StreamPublisher {
    pub async fn new(environment: &StreamEnvironment, super_stream: &'static str) -> Result<Self> {
        let producer = environment
            .inner()
            .super_stream_producer(RoutingStrategy::HashRoutingStrategy(
                HashRoutingMurmurStrategy {
                    routing_extractor: &partition_key,
                },
            ))
            .client_provided_name(&format!("lmnr-{}-producer", super_stream))
            .build(super_stream)
            .await
            .with_context(|| format!("Failed to build producer for '{}'", super_stream))?;

        Ok(Self {
            producer: Mutex::new(producer),
            super_stream,
        })
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
        {
            let mut producer = self.producer.lock().await;
            producer
                .send(message, move |confirm| {
                    let confirm_tx = confirm_tx.clone();
                    async move {
                        let outcome = match confirm {
                            Ok(status) if status.confirmed() => Ok(()),
                            Ok(status) => Err(format!("broker rejected: {:?}", status.status())),
                            Err(e) => Err(format!("{:?}", e)),
                        };
                        // Only the first confirmation is meaningful; a receiver
                        // dropped by timeout makes the send a no-op.
                        if let Some(tx) = confirm_tx.lock().await.take() {
                            let _ = tx.send(outcome);
                        }
                    }
                })
                .await
                .with_context(|| format!("Failed to publish to '{}'", super_stream))?;
        }

        let timeout = Duration::from_millis(env::streams::CONFIRM_TIMEOUT_MS.get());
        match tokio::time::timeout(timeout, confirm_rx).await {
            Ok(Ok(Ok(()))) => Ok(()),
            Ok(Ok(Err(reason))) => Err(anyhow!(
                "Stream publish to '{}' was not confirmed: {}",
                super_stream,
                reason
            )),
            // Sender dropped without confirming — the producer was closed.
            Ok(Err(_)) => Err(anyhow!(
                "Stream publish to '{}' lost its confirmation channel",
                super_stream
            )),
            Err(_) => Err(anyhow!(
                "Stream publish to '{}' was not confirmed within {:?}",
                super_stream,
                timeout
            )),
        }
    }
}
