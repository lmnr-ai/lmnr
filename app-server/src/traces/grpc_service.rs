use std::sync::Arc;

use lapin::Connection;
use sqlx::PgPool;

use crate::{
    api::utils::get_api_key_from_raw_value,
    cache::Cache,
    db::{api_keys::ProjectApiKey, DB},
    opentelemetry::opentelemetry::proto::collector::trace::v1::{
        trace_service_server::TraceService, ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
};
use tonic::{Request, Response, Status};

use super::producer::push_spans_to_queue;

pub struct ProcessTracesService {
    db: Arc<DB>,
    cache: Arc<Cache>,
    rabbitmq_connection: Arc<Connection>,
}

impl ProcessTracesService {
    pub fn new(db: Arc<DB>, cache: Arc<Cache>, rabbitmq_connection: Arc<Connection>) -> Self {
        Self {
            db,
            cache,
            rabbitmq_connection,
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

        let response = push_spans_to_queue(request, project_id, self.rabbitmq_connection.clone())
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
