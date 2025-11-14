use super::{QueryEngineTrait, QueryEngineValidationResult};
use super::query_engine::QueryStructure;
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
    
    async fn sql_to_json(&self, _sql: String) -> Result<QueryStructure> {
        Ok(QueryStructure {
            table: "mock_table".to_string(),
            metrics: vec![],
            dimensions: vec![],
            filters: vec![],
            time_range: None,
            order_by: vec![],
            limit: 0,
        })
    }

    async fn json_to_sql(&self, _query_structure: QueryStructure) -> Result<String> {
        Ok("SELECT 1".to_string())
    }
}
