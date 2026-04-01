pub mod client;
pub mod consumer;
mod doc_batch;
pub mod preprocess;
pub mod producer;
mod proto;
mod utils;

use std::sync::LazyLock;

use chrono::{DateTime, Utc};
use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::events::Event;
use crate::db::spans::Span;
use crate::utils::json_value_to_string;
use preprocess::preprocess_text;
use utils::extract_text_from_json_value;

pub const SPANS_INDEXER_QUEUE: &str = "spans_indexer_queue";
pub const SPANS_INDEXER_EXCHANGE: &str = "spans_indexer_exchange";
pub const SPANS_INDEXER_ROUTING_KEY: &str = "spans_indexer_routing_key";
pub const EVENTS_INDEX_ID: &str = "events";

pub static SPANS_INDEX_ID: LazyLock<String> =
    LazyLock::new(|| std::env::var("QUICKWIT_SPANS_INDEX_ID").unwrap_or("spans_v2".to_string()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickwitIndexedSpan {
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub start_time: DateTime<Utc>,
    pub input: Option<String>,
    pub output: Option<String>,
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
pub enum IndexerQueuePayload {
    Spans(Vec<QuickwitIndexedSpan>),
    Events(Vec<QuickwitIndexedEvent>),
}

/// Flatten JSON values for searchability and indexing. Each implementation
/// must serialize all respective JSON values to strings.
#[enum_dispatch(QuickwitDocument)]
pub trait FlattenJson {
    fn flatten_json(&mut self);
}

impl FlattenJson for QuickwitIndexedSpan {
    fn flatten_json(&mut self) {}
}

impl FlattenJson for QuickwitIndexedEvent {
    fn flatten_json(&mut self) {
        let attributes_text = extract_text_from_json_value(&self.attributes);
        let attributes_text = attributes_text.replace('{', " { ").replace('}', " } ");
        self.attributes = serde_json::Value::String(attributes_text);
    }
}

/// Preprocess text fields for Quickwit indexing. Normalizes escape sequences,
/// whitespace, ANSI codes, and Unicode before ingestion.
#[enum_dispatch(QuickwitDocument)]
pub trait PreprocessForIndexing {
    fn preprocess_for_indexing(&mut self);
}

impl PreprocessForIndexing for QuickwitIndexedSpan {
    fn preprocess_for_indexing(&mut self) {
        if let Some(ref input) = self.input {
            self.input = Some(preprocess_text(input));
        }
        if let Some(ref output) = self.output {
            self.output = Some(preprocess_text(output));
        }
    }
}

impl PreprocessForIndexing for QuickwitIndexedEvent {
    fn preprocess_for_indexing(&mut self) {
        self.name = preprocess_text(&self.name);
        if let Value::String(ref s) = self.attributes {
            self.attributes = Value::String(preprocess_text(s));
        }
    }
}

/// Enum to hold different document types for Quickwit ingestion.
/// Holds Serialize and FlattenJson traits for ingestion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
#[enum_dispatch]
pub enum QuickwitDocument {
    Span(QuickwitIndexedSpan),
    Event(QuickwitIndexedEvent),
}

impl IndexerQueuePayload {
    /// Get the index ID for this payload type
    pub fn index_id(&self) -> &'static str {
        match self {
            IndexerQueuePayload::Spans(_) => &SPANS_INDEX_ID,
            IndexerQueuePayload::Events(_) => EVENTS_INDEX_ID,
        }
    }

    /// Convert the payload into a vector of documents for Quickwit ingestion
    pub fn into_documents(self) -> Vec<QuickwitDocument> {
        match self {
            IndexerQueuePayload::Spans(spans) => {
                spans.into_iter().map(QuickwitDocument::Span).collect()
            }
            IndexerQueuePayload::Events(events) => {
                events.into_iter().map(QuickwitDocument::Event).collect()
            }
        }
    }
}
