use std::{env, sync::Arc};

use anyhow::anyhow;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex;
use tonic::transport::{Channel, Endpoint};
use uuid::Uuid;

use super::{
    doc_batch::build_json_doc_batch,
    proto::ingest_service::{
        CommitType, DocBatch, IngestRequest, ingest_service_client::IngestServiceClient,
    },
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

#[derive(Clone)]
pub struct QuickwitClient {
    inner: Arc<QuickwitClientInner>,
}

struct QuickwitClientInner {
    endpoint: String,
    client: Mutex<IngestServiceClient<Channel>>,
}

impl QuickwitClient {
    pub fn new(config: QuickwitIngestConfig) -> anyhow::Result<Self> {
        let endpoint = config.endpoint;
        let channel = create_channel(&endpoint)?;
        let client = IngestServiceClient::new(channel);

        Ok(Self {
            inner: Arc::new(QuickwitClientInner {
                endpoint,
                client: Mutex::new(client),
            }),
        })
    }

    pub fn endpoint(&self) -> &str {
        &self.inner.endpoint
    }

    pub async fn ingest(
        &self,
        index_id: &str,
        spans: &[QuickwitIndexedSpan],
    ) -> anyhow::Result<()> {
        let doc_batch = build_doc_batch(index_id, spans)?;
        let request = IngestRequest {
            doc_batches: vec![doc_batch],
            commit: CommitType::Auto as i32,
        };

        let mut client = self.inner.client.lock().await;
        client
            .ingest(request)
            .await
            .map(|_| ())
            .map_err(|status| anyhow!("Quickwit ingest request failed: {status}"))
    }

    pub async fn reconnect(&self) -> anyhow::Result<()> {
        let channel = create_channel(self.endpoint())?;
        let mut client = self.inner.client.lock().await;
        *client = IngestServiceClient::new(channel);
        Ok(())
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

fn create_channel(endpoint: &str) -> anyhow::Result<Channel> {
    let channel = Endpoint::from_shared(endpoint.to_string())?.connect_lazy();
    Ok(channel)
}
