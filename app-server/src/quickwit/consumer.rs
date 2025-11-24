use std::sync::Arc;

use anyhow::anyhow;
use backoff::ExponentialBackoffBuilder;
use serde_json::{self, Value};
use tokio::time::Duration;

use crate::{
    mq::{MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait},
    quickwit::{
        QuickwitIndexedSpan, SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_QUEUE,
        SPANS_INDEXER_ROUTING_KEY, client::QuickwitClient,
    },
};

const QUICKWIT_SPANS_DEFAULT_INDEX_ID: &str = "spans";

/// Extract text content from a JSON value for searchability.
/// Recursively extracts all string values and keys, avoiding double-encoding.
fn extract_text_from_json_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Object(obj) => {
            let mut parts = Vec::new();
            for (key, val) in obj {
                parts.push(key.clone());
                parts.push(extract_text_from_json_value(val));
            }
            parts.join(" ")
        }
        Value::Array(arr) => arr
            .iter()
            .map(extract_text_from_json_value)
            .collect::<Vec<_>>()
            .join(" "),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
    }
}

pub async fn process_indexer_queue_spans(
    queue: Arc<MessageQueue>,
    quickwit_client: QuickwitClient,
) {
    loop {
        if let Err(e) =
            inner_process_spans_indexer_queue(queue.clone(), quickwit_client.clone()).await
        {
            log::error!(
                "Quickwit spans indexer worker exited with error: {:?}. Restarting....",
                e
            );
        } else {
            log::warn!("Quickwit spans indexer worker exited gracefully. Restarting...");
        }
    }
}

async fn inner_process_spans_indexer_queue(
    queue: Arc<MessageQueue>,
    quickwit_client: QuickwitClient,
) -> anyhow::Result<()> {
    let get_receiver = || async {
        queue
            .get_receiver(
                SPANS_INDEXER_QUEUE,
                SPANS_INDEXER_EXCHANGE,
                SPANS_INDEXER_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to get receiver for Quickwit spans indexer queue: {:?}",
                    e
                );
                backoff::Error::transient(e)
            })
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_secs(1))
        .with_max_interval(Duration::from_secs(60))
        .with_max_elapsed_time(Some(Duration::from_secs(300)))
        .build();

    let mut receiver = match backoff::future::retry(backoff, get_receiver).await {
        Ok(receiver) => {
            log::info!("Connected to Quickwit spans indexer queue");
            receiver
        }
        Err(e) => {
            log::error!(
                "Failed to connect to Quickwit spans indexer queue after retries: {:?}",
                e
            );
            return Err(anyhow!("Could not bind to Quickwit spans indexer queue"));
        }
    };

    log::info!(
        "Quickwit spans indexer worker started (endpoint={})",
        quickwit_client.ingest_endpoint(),
    );

    while let Some(delivery) = receiver.receive().await {
        let delivery = match delivery {
            Ok(delivery) => delivery,
            Err(e) => {
                log::error!(
                    "Failed to receive message from Quickwit spans indexer queue: {:?}",
                    e
                );
                continue;
            }
        };

        let acker = delivery.acker();
        let payload = delivery.data();

        let mut indexed_spans: Vec<QuickwitIndexedSpan> = match serde_json::from_slice(&payload) {
            Ok(spans) => spans,
            Err(e) => {
                log::error!(
                    "Failed to deserialize Quickwit span payload ({} bytes): {:?}",
                    payload.len(),
                    e
                );
                let _ = acker.reject(false).await.map_err(|err| {
                    log::error!(
                        "Failed to reject malformed Quickwit indexing message: {:?}",
                        err
                    );
                });
                continue;
            }
        };

        if indexed_spans.is_empty() {
            if let Err(e) = acker.ack().await {
                log::error!(
                    "Failed to ack empty Quickwit indexing batch delivery: {:?}",
                    e
                );
            }
            continue;
        }

        for span in &mut indexed_spans {
            // Extract text content from JSON value for searchability
            // This avoids double-encoding: we want plain text, not a JSON-encoded string
            let attributes_text = extract_text_from_json_value(&span.attributes);
            let attributes_text = attributes_text.replace('{', " { ").replace('}', " } ");
            span.attributes = serde_json::Value::String(attributes_text);
        }

        let index_id = std::env::var("QUICKWIT_SPANS_INDEX_ID")
            .unwrap_or(QUICKWIT_SPANS_DEFAULT_INDEX_ID.to_string());

        match quickwit_client.ingest(&index_id, &indexed_spans).await {
            Ok(_) => {
                if let Err(e) = acker.ack().await {
                    log::error!(
                        "Failed to ack Quickwit indexing delivery after ingest success: {:?}",
                        e
                    );
                }
            }
            Err(e) => {
                log::error!(
                    "Failed to ingest {} spans into Quickwit: {:?}",
                    indexed_spans.len(),
                    e
                );

                let _ = acker.reject(true).await.map_err(|reject_err| {
                    log::error!(
                        "Failed to reject Quickwit indexing delivery after ingest failure: {:?}",
                        reject_err
                    );
                });

                // Attempt to reconnect, but don't propagate errors to avoid worker restart loops
                // If Quickwit is unavailable, we'll continue processing other messages
                if let Err(reconnect_err) = quickwit_client.reconnect().await {
                    log::warn!(
                        "Failed to reconnect to Quickwit (will retry on next message): {:?}",
                        reconnect_err
                    );
                }
            }
        }
    }

    log::warn!("Quickwit spans indexer queue closed connection");
    Ok(())
}
