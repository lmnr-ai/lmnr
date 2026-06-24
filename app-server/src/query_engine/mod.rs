//! In-process query engine. Replaces the Python gRPC query-engine service with
//! native Rust query validation and JSON↔SQL conversion built on `sqlparser`.

pub mod schema;
pub mod types;
pub mod validator;

mod json_to_sql;
mod sql_to_json;

use anyhow::Result;
use uuid::Uuid;

use types::QueryStructure;
use validator::QueryValidator;

#[derive(Debug, Clone)]
pub enum QueryEngineValidationResult {
    Success { validated_query: String },
    Error { error: String },
}

#[derive(Clone, Default)]
pub struct QueryEngine {
    validator: QueryValidator,
}

impl QueryEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn validate_query(
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

    pub async fn sql_to_json(&self, sql: String) -> Result<QueryStructure> {
        sql_to_json::convert_sql_to_json(&sql).map_err(|e| anyhow::anyhow!(e))
    }

    pub async fn json_to_sql(&self, query_structure: QueryStructure) -> Result<String> {
        json_to_sql::convert_json_to_sql(&query_structure).map_err(|e| anyhow::anyhow!(e))
    }
}
