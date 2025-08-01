use super::{QueryEngineTrait, QueryEngineValidationResult};
use anyhow::Result;
use async_trait::async_trait;
use uuid::Uuid;

pub struct MockQueryEngine;

#[async_trait]
impl QueryEngineTrait for MockQueryEngine {
    async fn validate_query(
        &self,
        query: String,
        _project_id: Uuid,
    ) -> Result<QueryEngineValidationResult> {
        Ok(QueryEngineValidationResult::Success {
            success: true,
            validated_query: query,
        })
    }
}
