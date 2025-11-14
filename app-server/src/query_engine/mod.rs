use anyhow::Result;
use mock::MockQueryEngine;
use query_engine_impl::QueryEngineImpl;
use uuid::Uuid;

pub mod mock;
pub mod query_engine;
pub mod query_engine_impl;

pub use query_engine_impl::QueryEngineValidationResult;

#[enum_dispatch::enum_dispatch(QueryEngineTrait)]
pub enum QueryEngine {
    Grpc(QueryEngineImpl),
    Mock(MockQueryEngine),
}

#[enum_dispatch::enum_dispatch]
pub trait QueryEngineTrait {
    async fn validate_query(
        &self,
        query: String,
        project_id: Uuid,
    ) -> Result<QueryEngineValidationResult>;
    
    async fn sql_to_json(&self, sql: String) -> Result<query_engine::QueryStructure>;
    
    async fn json_to_sql(&self, query_structure: query_engine::QueryStructure) -> Result<String>;
}
