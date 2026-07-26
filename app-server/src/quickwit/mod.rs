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

use crate::ch::signal_events::CHSignalEvent;
use crate::db::events::Event;
use crate::db::spans::Span;
use crate::utils::json_value_to_string;
use preprocess::{clean_for_indexing, preprocess_text};
use utils::{extract_text_from_json_value, preprocess_json_strings};

pub const SPANS_INDEXER_QUEUE: &str = "spans_indexer_queue";
pub const SPANS_INDEXER_EXCHANGE: &str = "spans_indexer_exchange";
pub const SPANS_INDEXER_ROUTING_KEY: &str = "spans_indexer_routing_key";
pub const EVENTS_INDEX_ID: &str = "events";
pub const SIGNAL_EVENTS_INDEX_ID: &str = "signal_events";

pub static SPANS_INDEX_ID: LazyLock<String> =
    LazyLock::new(|| crate::env::quickwit::SPANS_INDEX_ID.get());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickwitIndexedSpan {
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub start_time: DateTime<Utc>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub attributes: Option<String>,
}

/// Join already-serialized JSON message strings into a JSON array literal
/// without parsing them — each string is known-valid JSON text (it was
/// produced by serializing a `Value` upstream), so no deserialize/reserialize
/// round trip is needed just to concatenate them.
fn join_message_contents(msgs: &[String]) -> String {
    format!("[{}]", msgs.join(","))
}

impl QuickwitIndexedSpan {
    /// Build a span document for Quickwit indexing.
    ///
    /// `new_input_messages` / `new_output_messages`: when provided (LLM spans
    /// only), `input` / `output` is the JSON array of just those messages'
    /// already-serialized JSON text — the search index sees only the new
    /// turn, so older repeated history doesn't dominate matches. Pass `None`
    /// for non-LLM spans / non-array inputs to fall through to raw
    /// `span.input` / `span.output`. Output is dedup'd the same way input is:
    /// post-LAM-1608 `span.output` is `None` on the wire for dedup'd LLM
    /// spans, so the indexer must reconstruct the trace-new output array from
    /// the dedup verdict, not read `span.output`.
    ///
    /// Cleaning runs here (base64 / signature stripping, role-key stripping
    /// for LLM input/output, whitespace collapse) so the Quickwit consumer
    /// doesn't have to know about provider-specific shapes.
    pub fn from_span(
        span: &Span,
        new_input_messages: Option<&[String]>,
        new_output_messages: Option<&[String]>,
    ) -> Self {
        // `is_llm_span()` matches the dedup / new-messages-subset predicate so
        // cached LLM spans get role-key stripping like regular LLM spans.
        let is_llm = span.is_llm_span();

        let raw_input = match new_input_messages {
            Some(msgs) => Some(join_message_contents(msgs)),
            None => span.input.as_ref().map(json_value_to_string),
        };
        let input = raw_input.map(|s| clean_for_indexing(&s, is_llm));

        let raw_output = match new_output_messages {
            Some(msgs) => Some(join_message_contents(msgs)),
            None => span.output.as_ref().map(json_value_to_string),
        };
        let output = raw_output.map(|s| clean_for_indexing(&s, is_llm));

        let attributes = if span.attributes.raw_attributes.is_empty() {
            None
        } else {
            serde_json::to_string(&span.attributes.raw_attributes)
                .ok()
                .map(|s| clean_for_indexing(&s, false))
        };

        Self {
            span_id: span.span_id,
            project_id: span.project_id,
            trace_id: span.trace_id,
            start_time: span.start_time,
            input,
            output,
            attributes,
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
pub struct QuickwitIndexedSignalEvent {
    pub id: Uuid,
    pub project_id: Uuid,
    pub signal_id: Uuid,
    pub trace_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub severity: u8,
    pub payload: Value,
}

impl QuickwitIndexedSignalEvent {
    pub fn from_event(event: &CHSignalEvent) -> Self {
        let timestamp = DateTime::<Utc>::from_timestamp_nanos(event.timestamp);
        let payload = serde_json::from_str::<Value>(&event.payload).unwrap_or(Value::Null);

        Self {
            id: event.id,
            project_id: event.project_id,
            signal_id: event.signal_id,
            trace_id: event.trace_id,
            timestamp,
            severity: event.severity,
            payload,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum IndexerQueuePayload {
    Spans(Vec<QuickwitIndexedSpan>),
    Events(Vec<QuickwitIndexedEvent>),
    SignalEvents(Vec<QuickwitIndexedSignalEvent>),
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

impl FlattenJson for QuickwitIndexedSignalEvent {
    // `payload` is a Quickwit `json` field — ship the parsed Value as-is so
    // each subfield gets its own token stream.
    fn flatten_json(&mut self) {}
}

/// Preprocess text fields for Quickwit indexing. Normalizes escape sequences,
/// whitespace, ANSI codes, and Unicode before ingestion.
#[enum_dispatch(QuickwitDocument)]
pub trait PreprocessForIndexing {
    fn preprocess_for_indexing(&mut self);
}

impl PreprocessForIndexing for QuickwitIndexedSpan {
    // Spans are cleaned at build time via `clean_for_indexing` in `from_span`.
    fn preprocess_for_indexing(&mut self) {}
}

impl PreprocessForIndexing for QuickwitIndexedEvent {
    fn preprocess_for_indexing(&mut self) {
        self.name = preprocess_text(&self.name);
        if let Value::String(ref s) = self.attributes {
            self.attributes = Value::String(preprocess_text(s));
        }
    }
}

impl PreprocessForIndexing for QuickwitIndexedSignalEvent {
    fn preprocess_for_indexing(&mut self) {
        preprocess_json_strings(&mut self.payload);
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
    SignalEvent(QuickwitIndexedSignalEvent),
}

impl IndexerQueuePayload {
    /// Get the index ID for this payload type
    pub fn index_id(&self) -> &'static str {
        match self {
            IndexerQueuePayload::Spans(_) => &SPANS_INDEX_ID,
            IndexerQueuePayload::Events(_) => EVENTS_INDEX_ID,
            IndexerQueuePayload::SignalEvents(_) => SIGNAL_EVENTS_INDEX_ID,
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
            IndexerQueuePayload::SignalEvents(events) => events
                .into_iter()
                .map(QuickwitDocument::SignalEvent)
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spans::{Span, SpanType};

    #[test]
    fn join_message_contents_builds_array_literal() {
        let msgs = vec![
            r#"{"role":"user","content":"hi"}"#.to_string(),
            r#"{"role":"assistant","content":"hello"}"#.to_string(),
        ];
        assert_eq!(
            join_message_contents(&msgs),
            r#"[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]"#
        );
    }

    #[test]
    fn join_message_contents_empty() {
        assert_eq!(join_message_contents(&[]), "[]");
    }

    #[test]
    fn from_span_uses_dedup_content_strings_directly_without_reparsing() {
        // The dedup content strings arrive already-serialized (as they do on
        // the wire from `MessageDedup::trace_new_contents`); `from_span` must
        // splice them into the indexed `input`/`output` verbatim rather than
        // parsing to `Value` and re-serializing.
        let span = Span {
            span_type: SpanType::LLM,
            ..Default::default()
        };
        let new_input = vec![r#"{"role":"user","content":"hi"}"#.to_string()];
        let new_output = vec![r#"{"role":"assistant","content":"hello"}"#.to_string()];

        let doc = QuickwitIndexedSpan::from_span(&span, Some(&new_input), Some(&new_output));

        assert_eq!(
            doc.input.unwrap(),
            r#"[{"content":"hi"}]"#,
            "role key is stripped for LLM spans by clean_for_indexing"
        );
        assert_eq!(doc.output.unwrap(), r#"[{"content":"hello"}]"#);
    }

    #[test]
    fn from_span_falls_through_to_raw_span_input_when_no_dedup() {
        let span = Span {
            span_type: SpanType::LLM,
            input: Some(Value::Array(vec![])),
            output: None,
            ..Default::default()
        };

        let doc = QuickwitIndexedSpan::from_span(&span, None, None);

        assert_eq!(doc.input.unwrap(), "[]");
        assert_eq!(doc.output, None);
    }
}
