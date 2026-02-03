use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    api::utils::get_api_key_from_raw_value,
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    opentelemetry_proto::opentelemetry::proto::collector::logs::v1::{
        ExportLogsServiceRequest, ExportLogsServiceResponse, logs_service_server::LogsService,
    },
    traces::limits::get_workspace_limit_exceeded_by_project_id,
};
use tonic::{Request, Response, Status};

use super::producer::push_logs_to_queue;

pub struct ProcessLogsService {
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
}

impl ProcessLogsService {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<Cache>,
        clickhouse: clickhouse::Client,
        queue: Arc<MessageQueue>,
    ) -> Self {
        Self {
            db,
            cache,
            clickhouse,
            queue,
        }
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

        if is_feature_enabled(Feature::UsageLimit) {
            let limits_exceeded = get_workspace_limit_exceeded_by_project_id(
                self.db.clone(),
                self.clickhouse.clone(),
                self.cache.clone(),
                project_id,
            )
            .await
            .map_err(|e| {
                // Don't throw an error here. If there is a problem with us
                // getting the limits, we don't want to block the user from
                // sending logs.
                log::error!("Failed to get workspace limits: {:?}", e);
            });

            if limits_exceeded.is_ok_and(|limits_exceeded| limits_exceeded.bytes_ingested) {
                return Err(Status::resource_exhausted("Workspace data limit exceeded"));
            }
        }

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
