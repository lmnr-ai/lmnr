//! In-process query engine. Replaces the Python gRPC query-engine service with
//! native Rust query validation and JSON↔SQL conversion built on `sqlparser`.

pub mod types;
pub mod validator;

mod json_to_sql;
mod sql_to_json;

use anyhow::Result;
use uuid::Uuid;

use super::{QueryEngineTrait, QueryEngineValidationResult};
use types::QueryStructure;
use validator::QueryValidator;

#[derive(Clone, Default)]
pub struct InProcessQueryEngine {
    validator: QueryValidator,
}

impl InProcessQueryEngine {
    pub fn new() -> Self {
        Self::default()
    }
}

impl QueryEngineTrait for InProcessQueryEngine {
    async fn validate_query(
        &self,
        query: String,
        project_id: Uuid,
    ) -> Result<QueryEngineValidationResult> {
        match self
            .validator
            .validate_and_secure_query(&query, &project_id.to_string())
        {
            Ok(validated_query) => Ok(QueryEngineValidationResult::Success { validated_query }),
            Err(error) => Ok(QueryEngineValidationResult::Error { error }),
        }
    }

    async fn sql_to_json(&self, sql: String) -> Result<QueryStructure> {
        sql_to_json::convert_sql_to_json(&sql).map_err(|e| anyhow::anyhow!(e))
    }

    async fn json_to_sql(&self, query_structure: QueryStructure) -> Result<String> {
        json_to_sql::convert_json_to_sql(&query_structure).map_err(|e| anyhow::anyhow!(e))
    }
}
