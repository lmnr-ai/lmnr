use anyhow::Result;
use in_process::InProcessQueryEngine;
use mock::MockQueryEngine;
use uuid::Uuid;

pub mod in_process;
pub mod mock;

#[derive(Debug, Clone)]
pub enum QueryEngineValidationResult {
    Success { validated_query: String },
    Error { error: String },
}

#[enum_dispatch::enum_dispatch(QueryEngineTrait)]
pub enum QueryEngine {
    InProcess(InProcessQueryEngine),
    Mock(MockQueryEngine),
}

#[enum_dispatch::enum_dispatch]
pub trait QueryEngineTrait {
    async fn validate_query(
        &self,
        query: String,
        project_id: Uuid,
    ) -> Result<QueryEngineValidationResult>;

    async fn sql_to_json(&self, sql: String) -> Result<in_process::types::QueryStructure>;

    async fn json_to_sql(
        &self,
        query_structure: in_process::types::QueryStructure,
    ) -> Result<String>;
}
