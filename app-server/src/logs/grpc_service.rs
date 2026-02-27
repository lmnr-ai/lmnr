use std::sync::Arc;

use crate::{
    auth::authenticate_request,
    cache::Cache,
    db::DB,
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    opentelemetry_proto::opentelemetry::proto::collector::logs::v1::{
        ExportLogsServiceRequest, ExportLogsServiceResponse, logs_service_server::LogsService,
    },
    utils::limits::get_workspace_bytes_limit_exceeded,
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
            let bytes_limit_exceeded = get_workspace_bytes_limit_exceeded(
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

            if bytes_limit_exceeded.is_ok_and(|exceeded| exceeded) {
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
