use super::QueryEngineTrait;
use super::query_engine::{QueryRequest, query_engine_service_client::QueryEngineServiceClient};
use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;
use tonic::{Request, transport::Channel};
use uuid::Uuid;

#[derive(Clone)]
pub struct QueryEngineImpl {
    client: Arc<QueryEngineServiceClient<Channel>>,
}

impl QueryEngineImpl {
    pub fn new(client: Arc<QueryEngineServiceClient<Channel>>) -> Self {
        Self { client }
    }
}

#[async_trait]
impl QueryEngineTrait for QueryEngineImpl {
    async fn validate_query(
        &self,
        query: String,
        project_id: Uuid,
    ) -> Result<QueryEngineValidationResult> {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(QueryRequest {
            query,
            project_id: project_id.to_string(),
        });

        let response = client
            .validate_query(request)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to validate query: {}", e))?;

        let query_response = response.into_inner();

        match query_response.result {
            Some(super::query_engine::query_response::Result::Success(success_response)) => {
                Ok(QueryEngineValidationResult::Success {
                    success: success_response.success,
                    validated_query: success_response.query,
                })
            }
            Some(super::query_engine::query_response::Result::Error(error_response)) => {
                Ok(QueryEngineValidationResult::Error {
                    error: error_response.error,
                })
            }
            None => Err(anyhow::anyhow!(
                "Invalid response from query engine: no result"
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub enum QueryEngineValidationResult {
    Success {
        success: bool,
        validated_query: String,
    },
    Error {
        error: String,
    },
}
