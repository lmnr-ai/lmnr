use std::sync::Arc;

use actix_limitation::{Error as LimiterError, Limiter};
use uuid::Uuid;

use crate::{
    auth::authenticate_request,
    cache::{Cache, CacheTrait, keys::INGESTION_RATE_LIMIT_PROJECT_ID_CACHE_KEY},
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
    rate_limiter: Option<Limiter>,
}

impl ProcessTracesService {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<Cache>,
        clickhouse: clickhouse::Client,
        queue: Arc<MessageQueue>,
        rate_limiter: Option<Limiter>,
    ) -> Self {
        Self {
            db,
            cache,
            clickhouse,
            queue,
            rate_limiter,
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

        // Per-project gRPC rate limit. Shares the same Redis key
        // (`ratelimit:<project_id>`) and quota as the HTTP rate limiter so
        // OTLP/HTTP and OTLP/gRPC can't bypass each other. Fail-open on Redis
        // errors — same posture as the bytes-limit check below — so a Redis
        // blip doesn't black-hole ingestion.
        if let Some(ref limiter) = self.rate_limiter {
            if is_project_id_rate_limited(self.cache.clone(), project_id).await {
                let key = format!("grpc_ratelimit:{}", project_id);
                match limiter.count(key).await {
                    Ok(_) => {}
                    Err(LimiterError::LimitExceeded(_)) => {
                        return Err(Status::resource_exhausted("Rate limit exceeded"));
                    }
                    Err(e) => {
                        log::error!("Rate limiter error, allowing request: {:?}", e);
                    }
                }
            }
        }

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

async fn is_project_id_rate_limited(cache: Arc<Cache>, project_id: Uuid) -> bool {
    match cache
        .get::<i8>(&format!(
            "{INGESTION_RATE_LIMIT_PROJECT_ID_CACHE_KEY}:{}",
            project_id.to_string()
        ))
        .await
    {
        Ok(Some(v)) => v != 0,
        Ok(None) => false,
        Err(e) => {
            log::error!("Error getting rate limited project ids: {:?}", e);
            false
        }
    }
}
