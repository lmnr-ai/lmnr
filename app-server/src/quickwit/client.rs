use std::{env, sync::Arc};

use anyhow::anyhow;
use tokio::sync::Mutex;
use tonic::transport::{Channel, Endpoint};

use super::{
    QuickwitIndexedSpan,
    doc_batch::build_json_doc_batch,
    proto::ingest_service::{
        CommitType, DocBatch, IngestRequest, ingest_service_client::IngestServiceClient,
    },
};

const DEFAULT_INGEST_ENDPOINT: &str = "http://localhost:7281";

#[derive(Clone)]
pub struct QuickwitIngestConfig {
    pub endpoint: String,
}

impl QuickwitIngestConfig {
    pub fn from_env() -> Self {
        Self {
            endpoint: env::var("QUICKWIT_INGEST_URL")
                .unwrap_or(DEFAULT_INGEST_ENDPOINT.to_string()),
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
    pub async fn connect(config: QuickwitIngestConfig) -> anyhow::Result<Self> {
        let endpoint = config.endpoint;
        let channel = connect_channel(&endpoint).await?;
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
        let channel = connect_channel(self.endpoint()).await?;
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

async fn connect_channel(endpoint: &str) -> anyhow::Result<Channel> {
    Ok(Endpoint::from_shared(endpoint.to_string())?
        .connect()
        .await?)
}
