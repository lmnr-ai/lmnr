use std::sync::Arc;

use lapin::Connection;
use sqlx::PgPool;

use crate::{
    api::utils::get_api_key_from_raw_value,
    cache::Cache,
    db::{project_api_keys::ProjectApiKey, DB},
    features::{is_feature_enabled, Feature},
    opentelemetry::opentelemetry::proto::collector::trace::v1::{
        trace_service_server::TraceService, ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
    storage::Storage,
};
use tonic::{Request, Response, Status};

use super::{limits::get_workspace_limit_exceeded_by_project_id, producer::push_spans_to_queue};

pub struct ProcessTracesService {
    db: Arc<DB>,
    cache: Arc<Cache>,
    rabbitmq_connection: Arc<Connection>,
    storage: Arc<dyn Storage>,
}

impl ProcessTracesService {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<Cache>,
        rabbitmq_connection: Arc<Connection>,
        storage: Arc<dyn Storage>,
    ) -> Self {
        Self {
            db,
            cache,
            rabbitmq_connection,
            storage,
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
                self.cache.clone(),
                project_id,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to get workspace limits: {:?}", e);
                Status::internal("Failed to get workspace limits")
            })?;

            // TODO: do the same for events
            if limits_exceeded.spans {
                return Err(Status::resource_exhausted("Workspace span limit exceeded"));
            }
        }

        let response = push_spans_to_queue(
            request,
            project_id,
            self.rabbitmq_connection.clone(),
            self.storage.clone(),
        )
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
    if let Some(auth_header) = metadata.get("authorization") {
        let auth_str = auth_header
            .to_str()
            .map_err(|_| Status::unauthenticated("Invalid token"))?;
        if auth_str.starts_with("Bearer ") {
            return Ok(auth_str.trim_start_matches("Bearer ").to_string());
        }
    }
    Err(anyhow::anyhow!("No bearer token found"))
}
