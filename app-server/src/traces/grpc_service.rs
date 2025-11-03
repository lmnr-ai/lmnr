use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    api::utils::get_api_key_from_raw_value,
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    opentelemetry_proto::opentelemetry::proto::collector::trace::v1::{
        ExportTraceServiceRequest, ExportTraceServiceResponse, trace_service_server::TraceService,
    },
};
use tonic::{Request, Response, Status};

use super::{limits::get_workspace_limit_exceeded_by_project_id, producer::push_spans_to_queue};

pub struct ProcessTracesService {
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
}

impl ProcessTracesService {
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
impl TraceService for ProcessTracesService {
    async fn export(
        &self,
        request: Request<ExportTraceServiceRequest>,
    ) -> Result<Response<ExportTraceServiceResponse>, Status> {
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
                // sending traces.
                log::error!("Failed to get workspace limits: {:?}", e);
            });

            if limits_exceeded.is_ok_and(|limits_exceeded| limits_exceeded.bytes_ingested) {
                return Err(Status::resource_exhausted("Workspace data limit exceeded"));
            }
        }

        let response = push_spans_to_queue(request, project_id, self.queue.clone())
            .await
            .map_err(|e| {
                log::error!("Failed to process traces: {:?}", e);
                Status::internal("Failed to process traces")
            })?;

        Ok(Response::new(response))
    }
}

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
