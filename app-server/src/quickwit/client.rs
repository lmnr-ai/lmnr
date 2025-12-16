use std::{env, sync::Arc};

use anyhow::anyhow;
use tokio::sync::Mutex;
use tonic::transport::{Channel, Endpoint};
use tracing::instrument;

use super::{
    doc_batch::build_json_doc_batch,
    proto::ingest_service::{
        CommitType, DocBatch, IngestRequest, ingest_service_client::IngestServiceClient,
    },
};

const DEFAULT_INGEST_ENDPOINT: &str = "http://localhost:7281";
const DEFAULT_SEARCH_ENDPOINT: &str = "http://localhost:7280";

#[derive(Clone)]
pub struct QuickwitConfig {
    pub ingest_endpoint: String,
    pub search_endpoint: String,
}

impl QuickwitConfig {
    pub fn from_env() -> Self {
        Self {
            ingest_endpoint: env::var("QUICKWIT_INGEST_URL")
                .unwrap_or(DEFAULT_INGEST_ENDPOINT.to_string()),
            search_endpoint: env::var("QUICKWIT_SEARCH_URL")
                .unwrap_or(DEFAULT_SEARCH_ENDPOINT.to_string()),
        }
    }
}

#[derive(Clone)]
pub struct QuickwitClient {
    inner: Arc<QuickwitClientInner>,
}

pub struct QuickwitErrorInner {
    message: String,
    code: tonic::Code,
}

pub enum QuickwitError {
    Transient(QuickwitErrorInner),
    Permanent(QuickwitErrorInner),
}

impl QuickwitError {
    pub fn from_status(status: tonic::Status) -> Self {
        match status.code() {
            tonic::Code::DeadlineExceeded
            | tonic::Code::Unavailable
            | tonic::Code::FailedPrecondition => Self::Transient(QuickwitErrorInner {
                message: status.message().to_string(),
                code: status.code(),
            }),
            _ => Self::Permanent(QuickwitErrorInner {
                message: status.message().to_string(),
                code: status.code(),
            }),
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::Transient(inner) => inner.message.clone(),
            Self::Permanent(inner) => inner.message.clone(),
        }
    }

    pub fn status_code(&self) -> tonic::Code {
        match self {
            Self::Transient(inner) => inner.code,
            Self::Permanent(inner) => inner.code,
        }
    }

    pub fn to_handler_error(&self) -> crate::worker::HandlerError {
        match self {
            Self::Transient(inner) => {
                crate::worker::HandlerError::transient(anyhow::anyhow!(format!(
                    "Quickwit transient error: [{}] {}",
                    inner.code, inner.message
                )))
            }
            Self::Permanent(inner) => {
                crate::worker::HandlerError::permanent(anyhow::anyhow!(format!(
                    "Quickwit permanent error: [{}] {}",
                    inner.code, inner.message
                )))
            }
        }
    }
}

struct QuickwitClientInner {
    ingest_endpoint: String,
    search_endpoint: String,
    ingest_client: Mutex<IngestServiceClient<Channel>>, // gRPC
    search_client: reqwest::Client,                     // HTTP
}

impl QuickwitClient {
    pub async fn connect(config: QuickwitConfig) -> anyhow::Result<Self> {
        let ingest_endpoint = config.ingest_endpoint;
        let channel = connect_channel(&ingest_endpoint).await?;
        let grpc_client = IngestServiceClient::new(channel);
        let http_client = reqwest::Client::new();

        Ok(Self {
            inner: Arc::new(QuickwitClientInner {
                ingest_endpoint,
                search_endpoint: config.search_endpoint,
                ingest_client: Mutex::new(grpc_client),
                search_client: http_client,
            }),
        })
    }

    pub fn ingest_endpoint(&self) -> &str {
        &self.inner.ingest_endpoint
    }

    #[instrument(skip(self, docs))]
    pub async fn ingest<T: serde::Serialize>(
        &self,
        index_id: &str,
        docs: &[T],
    ) -> Result<(), QuickwitError> {
        let doc_batch = build_doc_batch(index_id, docs).map_err(|err| {
            QuickwitError::Permanent(QuickwitErrorInner {
                message: err.to_string(),
                code: tonic::Code::Internal,
            })
        })?;
        let request = IngestRequest {
            doc_batches: vec![doc_batch],
            commit: CommitType::Auto as i32,
        };

        let mut client = self.inner.ingest_client.lock().await;
        client
            .ingest(request)
            .await
            .map(|_| ())
            .map_err(|status| QuickwitError::from_status(status))
    }

    #[instrument(skip(self))]
    pub async fn search_spans(
        &self,
        query_body: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value> {
        let url = format!("{}/api/v1/spans/search", self.inner.search_endpoint);

        let response = self
            .inner
            .search_client
            .post(&url)
            .json(&query_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Quickwit search failed: {}", error_text));
        }

        let result = response.json::<serde_json::Value>().await?;
        Ok(result)
    }

    pub async fn reconnect(&self) -> anyhow::Result<()> {
        let channel = connect_channel(self.ingest_endpoint()).await?;
        let mut client = self.inner.ingest_client.lock().await;
        *client = IngestServiceClient::new(channel);
        Ok(())
    }
}

#[instrument(skip(docs))]
pub fn build_doc_batch<T: serde::Serialize>(
    index_id: &str,
    docs: &[T],
) -> anyhow::Result<DocBatch> {
    build_json_doc_batch(index_id, docs).map_err(|err| {
        anyhow!(
            "Failed to encode documents for Quickwit ingestion ({} docs): {}",
            docs.len(),
            err
        )
    })
}

async fn connect_channel(endpoint: &str) -> anyhow::Result<Channel> {
    Ok(Endpoint::from_shared(endpoint.to_string())?
        .connect()
        .await?)
}
