use async_trait::async_trait;
use serde_json::{self, Value};

use crate::{
    quickwit::{IndexerQueuePayload, client::QuickwitClient},
    worker::MessageHandler,
};

const QUICKWIT_SPANS_DEFAULT_INDEX_ID: &str = "spans";
const QUICKWIT_EVENTS_DEFAULT_INDEX_ID: &str = "events";

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

/// Handler for Quickwit span indexing
pub struct QuickwitIndexerHandler {
    pub quickwit_client: QuickwitClient,
}

#[async_trait]
impl MessageHandler for QuickwitIndexerHandler {
    type Message = IndexerQueuePayload;

    async fn handle(&self, payload: Self::Message) -> Result<(), crate::worker::HandlerError> {
        let (mut indexed_spans, mut indexed_events) = match payload {
            IndexerQueuePayload::IndexerQueueMessage(message) => (message.spans, message.events),
            IndexerQueuePayload::SpansOnly(spans) => (spans, vec![]),
        };

        if indexed_spans.is_empty() && indexed_events.is_empty() {
            return Ok(());
        }

        indexed_spans.iter_mut().for_each(|span| {
            // Extract text content from JSON value for searchability
            // This avoids double-encoding: we want plain text, not a JSON-encoded string
            let attributes_text = extract_text_from_json_value(&span.attributes);
            let attributes_text = attributes_text.replace('{', " { ").replace('}', " } ");
            span.attributes = serde_json::Value::String(attributes_text);
        });
        indexed_events.iter_mut().for_each(|event| {
            // Extract text content from JSON value for searchability
            // This avoids double-encoding: we want plain text, not a JSON-encoded string
            let attributes_text = extract_text_from_json_value(&event.attributes);
            let attributes_text = attributes_text.replace('{', " { ").replace('}', " } ");
            event.attributes = serde_json::Value::String(attributes_text);
        });

        let spans_index_id = std::env::var("QUICKWIT_SPANS_INDEX_ID")
            .unwrap_or(QUICKWIT_SPANS_DEFAULT_INDEX_ID.to_string());
        let events_index_id = std::env::var("QUICKWIT_EVENTS_INDEX_ID")
            .unwrap_or(QUICKWIT_EVENTS_DEFAULT_INDEX_ID.to_string());

        // Ingest spans if present
        let spans_result = if !indexed_spans.is_empty() {
            self.quickwit_client
                .ingest(&spans_index_id, &indexed_spans)
                .await
        } else {
            Ok(())
        };

        // Ingest events if present
        let events_result = if !indexed_events.is_empty() {
            self.quickwit_client
                .ingest(&events_index_id, &indexed_events)
                .await
        } else {
            Ok(())
        };

        // Only ack if both ingests succeeded
        // TODO: instead of requeueing with HanlerError::transient, we may want to
        // actually ack and rebuild the message with only the failed ingest.
        // E.g. if spans ingest worked, but events ingest failed, we should ack
        // the message and rebuild the message with only the events.
        match (spans_result, events_result) {
            (Ok(_), Ok(_)) => Ok(()),
            (Err(e), _) => {
                // Log specific failures
                log::error!(
                    "Failed to ingest {} spans into Quickwit: {:?}",
                    indexed_spans.len(),
                    e
                );
                let _ = self.quickwit_client.reconnect().await;
                Err(crate::worker::HandlerError::transient(anyhow::anyhow!(
                    "Failed to ingest spans into Quickwit: {:?}",
                    e
                )))
            }
            (_, Err(e)) => {
                log::error!(
                    "Failed to ingest {} events into Quickwit: {:?}",
                    indexed_events.len(),
                    e
                );
                let _ = self.quickwit_client.reconnect().await;
                Err(crate::worker::HandlerError::transient(anyhow::anyhow!(
                    "Failed to ingest events into Quickwit: {:?}",
                    e
                )))
            }
        }
    }
}
