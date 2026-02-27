use std::sync::Arc;

use crate::{
    auth::authenticate_request,
    cache::Cache,
    db::DB,
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    opentelemetry_proto::opentelemetry::proto::collector::trace::v1::{
        ExportTraceServiceRequest, ExportTraceServiceResponse, trace_service_server::TraceService,
    },
    utils::limits::get_workspace_bytes_limit_exceeded,
};
use tonic::{Request, Response, Status};

use super::producer::push_spans_to_queue;

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
                // sending traces.
                log::error!("Failed to get workspace limits: {:?}", e);
            });

            if bytes_limit_exceeded.is_ok_and(|exceeded| exceeded) {
                return Err(Status::resource_exhausted("Workspace data limit exceeded"));
            }
        }

        let response = push_spans_to_queue(
            request,
            project_id,
            self.queue.clone(),
            self.db.clone(),
            self.cache.clone(),
        )
        .await
        .map_err(|e| {
            log::error!("Failed to process traces: {:?}", e);
            Status::internal("Failed to process traces")
        })?;

        Ok(Response::new(response))
    }
}
