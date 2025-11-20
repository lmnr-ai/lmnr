use std::env;

use anyhow::anyhow;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tonic::transport::Channel;
use uuid::Uuid;

use crate::quickwit::doc_batch::build_json_doc_batch;
use crate::quickwit::proto::ingest_service::{
    DocBatch, ingest_service_client::IngestServiceClient,
};
use crate::{db::spans::Span, utils::json_value_to_string};

const DEFAULT_INGEST_ENDPOINT: &str = "http://localhost:7281";

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

#[derive(Clone)]
pub struct QuickwitIngestConfig {
    pub endpoint: String,
}

impl QuickwitIngestConfig {
    pub fn from_env() -> Self {
        Self {
            endpoint: env::var("QUICKWIT_INGEST_URL")
                .unwrap_or_else(|_| DEFAULT_INGEST_ENDPOINT.to_string()),
        }
    }
}

pub fn build_doc_batch(index_id: &str, spans: &[QuickwitIndexedSpan]) -> anyhow::Result<DocBatch> {
    build_json_doc_batch(index_id, spans).map_err(|err| {
        anyhow!(
            "Failed to encode spans for Quickwit ingestion ({} docs): {}",
            spans.len(),
            err
        )
    })
}

pub async fn connect_quickwit_client(
    endpoint: &str,
) -> anyhow::Result<IngestServiceClient<Channel>> {
    IngestServiceClient::connect(endpoint.to_string())
        .await
        .map_err(|err| {
            anyhow!(
                "Failed to connect to Quickwit ingest endpoint {}: {}",
                endpoint,
                err
            )
        })
}
