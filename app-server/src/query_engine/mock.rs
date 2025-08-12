use super::{QueryEngineTrait, QueryEngineValidationResult};
use anyhow::Result;
use uuid::Uuid;

pub struct MockQueryEngine;

impl QueryEngineTrait for MockQueryEngine {
    async fn validate_query(
        &self,
        query: String,
        _project_id: Uuid,
    ) -> Result<QueryEngineValidationResult> {
        Ok(QueryEngineValidationResult::Success {
            validated_query: query,
        })
    }
}
