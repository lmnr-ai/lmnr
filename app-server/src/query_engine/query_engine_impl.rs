use super::QueryEngineTrait;
use super::query_engine::{QueryRequest, query_engine_service_client::QueryEngineServiceClient};
use anyhow::Result;
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
            .map_err(|e| anyhow::anyhow!(format!("{}", e.message())))?;

        let query_response = response.into_inner();

        match query_response.result {
            Some(super::query_engine::query_response::Result::Success(success_response)) => {
                Ok(QueryEngineValidationResult::Success {
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

    async fn sql_to_json(&self, sql: String) -> Result<String> {
        use super::query_engine::{SqlToJsonRequest, sql_to_json_response};
        
        let mut client = self.client.as_ref().clone();
        
        let request = Request::new(SqlToJsonRequest { sql });
        
        let response = client
            .sql_to_json(request)
            .await
            .map_err(|e| anyhow::anyhow!(format!("{}", e.message())))?;
        
        let response_inner = response.into_inner();
        
        match response_inner.result {
            Some(sql_to_json_response::Result::JsonStructure(json_structure)) => {
                Ok(json_structure)
            }
            Some(sql_to_json_response::Result::Error(error_response)) => {
                Err(anyhow::anyhow!(error_response.error))
            }
            None => Err(anyhow::anyhow!(
                "Invalid response from query engine: no result"
            )),
        }
    }
    
    async fn json_to_sql(&self, json_structure: String) -> Result<String> {
        use super::query_engine::{JsonToSqlRequest, json_to_sql_response};
        
        let mut client = self.client.as_ref().clone();
        
        let request = Request::new(JsonToSqlRequest { json_structure });
        
        let response = client
            .json_to_sql(request)
            .await
            .map_err(|e| anyhow::anyhow!(format!("{}", e.message())))?;
        
        let response_inner = response.into_inner();
        
        match response_inner.result {
            Some(json_to_sql_response::Result::Sql(sql)) => {
                Ok(sql)
            }
            Some(json_to_sql_response::Result::Error(error_response)) => {
                Err(anyhow::anyhow!(error_response.error))
            }
            None => Err(anyhow::anyhow!(
                "Invalid response from query engine: no result"
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub enum QueryEngineValidationResult {
    Success { validated_query: String },
    Error { error: String },
}
