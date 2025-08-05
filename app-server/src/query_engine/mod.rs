use anyhow::Result;
use async_trait::async_trait;
use mock::MockQueryEngine;
use query_engine_impl::QueryEngineImpl;
use uuid::Uuid;

pub mod mock;
pub mod query_engine;
pub mod query_engine_impl;

pub use query_engine_impl::QueryEngineValidationResult;

#[enum_delegate::implement(QueryEngineTrait)]
pub enum QueryEngine {
    Grpc(QueryEngineImpl),
    Mock(MockQueryEngine),
}

#[async_trait]
#[enum_delegate::register]
pub trait QueryEngineTrait {
    async fn validate_query(
        &self,
        query: String,
        project_id: Uuid,
    ) -> Result<QueryEngineValidationResult>;
}
