use anyhow::{Context, Result};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::query_engine::{QueryEngine, QueryEngineTrait};

pub struct ClickhouseReadonlyClient(clickhouse::Client);

impl ClickhouseReadonlyClient {
    pub fn new(url: String, user: String, password: Option<String>) -> Self {
        let mut client = clickhouse::Client::default()
            .with_url(url)
            .with_user(user)
            .with_database("default");

        if let Some(password) = password {
            client = client.with_password(password);
        }

        Self(client)
    }

    pub fn query(&self, sql: &str) -> clickhouse::query::Query {
        self.0.query(sql)
    }
}

pub async fn execute_sql_query(
    query: String,
    project_id: Uuid,
    parameters: HashMap<String, Value>,
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    query_engine: Arc<QueryEngine>,
) -> Result<Value> {
    let validation_result = query_engine
        .validate_query(query, project_id)
        .await
        .context("Failed to validate query")?;

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

    let mut clickhouse_query = clickhouse_ro
        .query(&validated_query)
        .with_option("default_format", "JSON")
        .with_option("output_format_json_quote_64bit_integers", "0");

    for (key, value) in parameters {
        clickhouse_query = clickhouse_query.param(&key, value);
    }

    let mut rows = clickhouse_query
        .fetch_bytes("JSON")
        .context("Failed to execute ClickHouse query")?;

    let data = rows
        .collect()
        .await
        .context("Failed to collect query response data")?;

    let results: Value =
        serde_json::from_slice(&data).context("Failed to parse ClickHouse response as JSON")?;

    let data_array = results
        .get("data")
        .context("Response missing 'data' field")?
        .as_array()
        .context("Response 'data' field is not an array")?;

    Ok(Value::Array(data_array.clone()))
}
