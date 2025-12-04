use async_trait::async_trait;
use serde_json::{self, Value};

use crate::{
    quickwit::{QuickwitIndexedSpan, client::QuickwitClient},
    worker::MessageHandler,
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

/// Handler for Quickwit span indexing
pub struct QuickwitIndexerHandler {
    pub quickwit_client: QuickwitClient,
}

#[async_trait]
impl MessageHandler for QuickwitIndexerHandler {
    type Message = Vec<QuickwitIndexedSpan>;

    async fn handle(&self, mut indexed_spans: Self::Message) -> anyhow::Result<()> {
        if indexed_spans.is_empty() {
            return Ok(());
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

        self.quickwit_client.ingest(&index_id, &indexed_spans).await?;
        
        Ok(())
    }
    
    fn on_error(&self, error: &anyhow::Error) -> crate::worker::ErrorAction {
        log::error!("Failed to ingest spans into Quickwit: {:?}", error);
        
        // Try to reconnect for next message
        let client = self.quickwit_client.clone();
        tokio::spawn(async move {
            if let Err(e) = client.reconnect().await {
                log::warn!("Failed to reconnect to Quickwit: {:?}", e);
            }
        });
        
        // Requeue - Quickwit might be temporarily down
        crate::worker::ErrorAction::Reject { requeue: true }
    }
}
