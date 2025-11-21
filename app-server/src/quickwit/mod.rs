use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::spans::Span;
use crate::utils::json_value_to_string;

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

pub mod client;
pub mod consumer;
pub mod doc_batch;
pub mod producer;
pub mod proto;
