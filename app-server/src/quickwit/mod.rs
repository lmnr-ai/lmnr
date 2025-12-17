pub mod client;
pub mod consumer;
mod doc_batch;
pub mod producer;
mod proto;
mod utils;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::events::Event;
use crate::db::spans::Span;
use crate::utils::json_value_to_string;
use utils::extract_text_from_json_value;

pub const SPANS_INDEXER_QUEUE: &str = "spans_indexer_queue";
pub const SPANS_INDEXER_EXCHANGE: &str = "spans_indexer_exchange";
pub const SPANS_INDEXER_ROUTING_KEY: &str = "spans_indexer_routing_key";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickwitIndexedSpan {
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub start_time: DateTime<Utc>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub attributes: Value,
}

impl From<&Span> for QuickwitIndexedSpan {
    fn from(span: &Span) -> Self {
        Self {
            span_id: span.span_id,
            project_id: span.project_id,
            trace_id: span.trace_id,
            start_time: span.start_time,
            input: span.input.as_ref().map(json_value_to_string),
            output: span.output.as_ref().map(json_value_to_string),
            attributes: span.attributes.to_value(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickwitIndexedEvent {
    pub id: Uuid,
    pub is_exception: bool,
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub name: String,
    pub attributes: Value,
}

impl From<&Event> for QuickwitIndexedEvent {
    fn from(event: &Event) -> Self {
        Self {
            id: event.id,
            is_exception: event.is_exception(),
            span_id: event.span_id,
            project_id: event.project_id,
            trace_id: event.trace_id,
            timestamp: event.timestamp,
            name: event.name.clone(),
            attributes: event.attributes.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum IndexerQueueMessage {
    Spans(Vec<QuickwitIndexedSpan>),
    Events(Vec<QuickwitIndexedEvent>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum IndexerQueuePayload {
    IndexerQueueMessage(IndexerQueueMessage),
    // TODO: remove this once the change is merged and all items are removed
    // from the queue, and send the inner struct from producer directly.
    SpansOnly(Vec<QuickwitIndexedSpan>),
}

/// Flatten JSON values for searchability and indexing. Each implementation
/// must serialize all respective JSON values to strings.
pub trait FlattenJson {
    fn flatten_json(&mut self);
}

impl FlattenJson for QuickwitIndexedSpan {
    fn flatten_json(&mut self) {
        let attributes_text = extract_text_from_json_value(&self.attributes);
        let attributes_text = attributes_text.replace('{', " { ").replace('}', " } ");
        self.attributes = serde_json::Value::String(attributes_text);
    }
}

impl FlattenJson for QuickwitIndexedEvent {
    fn flatten_json(&mut self) {
        let attributes_text = extract_text_from_json_value(&self.attributes);
        let attributes_text = attributes_text.replace('{', " { ").replace('}', " } ");
        self.attributes = serde_json::Value::String(attributes_text);
    }
}

/// Enum to hold different document types for Quickwit ingestion.
/// Holds Serialize and FlattenJson traits for ingestion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum QuickwitDocument {
    Span(QuickwitIndexedSpan),
    Event(QuickwitIndexedEvent),
}

impl FlattenJson for QuickwitDocument {
    fn flatten_json(&mut self) {
        match self {
            QuickwitDocument::Span(span) => span.flatten_json(),
            QuickwitDocument::Event(event) => event.flatten_json(),
        }
    }
}

impl IndexerQueuePayload {
    /// Get the index ID for this payload type
    pub fn index_id(&self) -> &'static str {
        match self {
            IndexerQueuePayload::IndexerQueueMessage(IndexerQueueMessage::Spans(_)) => "spans",
            IndexerQueuePayload::IndexerQueueMessage(IndexerQueueMessage::Events(_)) => "events",
            IndexerQueuePayload::SpansOnly(_) => "spans",
        }
    }

    /// Convert the payload into a vector of documents for Quickwit ingestion
    pub fn into_documents(self) -> Vec<QuickwitDocument> {
        match self {
            IndexerQueuePayload::IndexerQueueMessage(IndexerQueueMessage::Spans(spans)) => spans
                .into_iter()
                .map(|span| QuickwitDocument::Span(span))
                .collect(),
            IndexerQueuePayload::IndexerQueueMessage(IndexerQueueMessage::Events(events)) => {
                events.into_iter().map(QuickwitDocument::Event).collect()
            }
            IndexerQueuePayload::SpansOnly(spans) => {
                spans.into_iter().map(QuickwitDocument::Span).collect()
            }
        }
    }
}
