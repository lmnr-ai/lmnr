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
    
    async fn sql_to_json(&self, _sql: String) -> Result<String> {
        Ok("{}".to_string())
    }
    
    async fn json_to_sql(&self, _json_structure: String) -> Result<String> {
        Ok("SELECT 1".to_string())
    }
}
