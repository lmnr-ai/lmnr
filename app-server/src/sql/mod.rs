use serde_json::Value;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::query_engine::{QueryEngine, QueryEngineTrait};

pub async fn execute_sql_query(
    query: String,
    project_id: Uuid,
    parameters: HashMap<String, Value>,
    clickhouse: clickhouse::Client,
    query_engine: Arc<QueryEngine>,
) -> Result<Value, anyhow::Error> {
    let validation_result = query_engine.validate_query(query, project_id).await?;

    let validated_query = match validation_result {
        crate::query_engine::QueryEngineValidationResult::Success {
            success,
            validated_query,
        } => {
            if !success {
                return Err(anyhow::anyhow!("Query validation reported unsuccessful"));
            }
            validated_query
        }
        crate::query_engine::QueryEngineValidationResult::Error { error } => {
            return Err(anyhow::anyhow!("Query validation failed: {}", error));
        }
    };

    let mut clickhouse_query = clickhouse.query(&format!("{} FORMAT JSONEachRow", validated_query));

    for (key, value) in parameters {
        clickhouse_query = clickhouse_query.param(&key, value);
    }

    let rows = clickhouse_query
        .fetch_all::<String>()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to execute ClickHouse query: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        match serde_json::from_str::<serde_json::Value>(&row) {
            Ok(json) => results.push(json),
            Err(e) => {
                log::warn!("Failed to parse row as JSON: {}, row: {}", e, row);
                results.push(serde_json::Value::String(row));
            }
        }
    }

    Ok(serde_json::Value::Array(results))
}
