use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    api::utils::get_api_key_from_raw_value,
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    mq::MessageQueue,
    opentelemetry_proto::lmnr::logs::v1::{
        ExportLogsServiceRequest, ExportLogsServiceResponse, logs_service_server::LogsService,
    },
};
use tonic::{Request, Response, Status};

use super::producer::push_logs_to_queue;

pub struct ProcessLogsService {
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
}

impl ProcessLogsService {
    pub fn new(db: Arc<DB>, cache: Arc<Cache>, queue: Arc<MessageQueue>) -> Self {
        Self { db, cache, queue }
    }
}

#[tonic::async_trait]
impl LogsService for ProcessLogsService {
    async fn export(
        &self,
        request: Request<ExportLogsServiceRequest>,
    ) -> Result<Response<ExportLogsServiceResponse>, Status> {
        let api_key = authenticate_request(request.metadata(), &self.db.pool, self.cache.clone())
            .await
            .map_err(|_| Status::unauthenticated("Failed to authenticate request"))?;
        let project_id = api_key.project_id;
        let request = request.into_inner();

        let response = push_logs_to_queue(request, project_id, self.queue.clone())
            .await
            .map_err(|e| {
                log::error!("Failed to process logs: {:?}", e);
                Status::internal("Failed to process logs")
            })?;

        Ok(Response::new(response))
    }
}

/// Authenticates gRPC logs ingestion requests.
/// Note: This endpoint accepts both default and ingest-only API keys,
/// as it's used for writing log data to the project.
async fn authenticate_request(
    metadata: &tonic::metadata::MetadataMap,
    pool: &PgPool,
    cache: Arc<Cache>,
) -> anyhow::Result<ProjectApiKey> {
    let token = extract_bearer_token(metadata)?;
    get_api_key_from_raw_value(pool, cache, token).await
}

fn extract_bearer_token(metadata: &tonic::metadata::MetadataMap) -> anyhow::Result<String> {
    // Default OpenTelemetry gRPC exporter uses `"authorization"` with lowercase `a`,
    // but users may use `"Authorization"` with uppercase `A` in custom exporters.
    let header = metadata
        .get("authorization")
        .or(metadata.get("Authorization"));
    if let Some(auth_header) = header {
        let auth_str = auth_header
            .to_str()
            .map_err(|_| Status::unauthenticated("Invalid token"))?;
        if auth_str.starts_with("Bearer ") {
            return Ok(auth_str.trim_start_matches("Bearer ").to_string());
        }
    }
    Err(anyhow::anyhow!("No bearer token found"))
}
