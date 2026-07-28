//! Super-stream publisher: hash-routed by partition key, one message per record.
//!
//! Routing key choice matters. `trace_id` spreads a single customer's burst
//! across every partition while keeping one trace's spans on ONE partition —
//! which is what gives us per-trace ordering and a single writer for the
//! Postgres trace upsert. Routing by `project_id` would funnel a bursting
//! customer's whole eval run into one partition and rebuild the hotspot this
//! migration exists to remove.

use anyhow::{Context, Result};
use rabbitmq_stream_client::{
    NoDedup,
    types::{HashRoutingMurmurStrategy, Message, RoutingStrategy, SuperStreamProducer},
};
use serde::Serialize;
use tokio::sync::Mutex;

use super::topology::StreamEnvironment;

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

    /// Publish one record, routed by `key`.
    ///
    /// Confirms are handled asynchronously by the client's batching producer, so
    /// this returns once the record is enqueued — the ingest request is not held
    /// for a broker round trip the way the quorum-queue path's awaited confirm
    /// does. A publish that fails after enqueue is logged by the callback; the
    /// SDK's own retry is the recovery path.
    pub async fn publish<T: Serialize>(&self, payload: &T, key: &str) -> Result<()> {
        let body = serde_json::to_vec(payload).context("Failed to serialize stream payload")?;
        let message = Message::builder()
            .body(body)
            .application_properties()
            .insert(PARTITION_KEY, key.to_string())
            .message_builder()
            .build();

        let super_stream = self.super_stream;
        let mut producer = self.producer.lock().await;
        producer
            .send(message, move |confirm| async move {
                if let Err(e) = confirm {
                    log::error!(
                        "Stream publish to '{}' was not confirmed: {:?}",
                        super_stream,
                        e
                    );
                }
            })
            .await
            .with_context(|| format!("Failed to publish to '{}'", super_stream))?;

        Ok(())
    }
}
