use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    env,
    sync::{Arc, LazyLock},
};
use uuid::Uuid;

use crate::query_engine::{QueryEngine, QueryEngineTrait, QueryEngineValidationResult};

pub struct ClickhouseReadonlyClient(clickhouse::Client);

#[derive(Debug, thiserror::Error)]
pub enum SqlQueryError {
    ValidationError(String),
    InternalError(String),
}

#[derive(Deserialize)]
struct ClickhouseBadResponseError {
    #[serde(default)]
    exception: Option<String>,
}

// Removes any settings explicitly set in the query.
const SETTING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s*SETTINGS\s+[A-Za-z_]*\s*=\s*'(?:[^'\\]|\\.)*'(?:\s*,\s*[A-Za-z_]*\s*=\s*'(?:[^'\\]|\\.)*')*\s*").unwrap()
});
// Removes clickhouse version info from the end of the error message.
const VERSION_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\s*\(version\s+\d+(?:\.\d+){0,3}(?:\s+\([^)]*\))?\)$").unwrap());

const DEFAULT_SQL_QUERY_MAX_EXECUTION_TIME: &str = "120";
const DEFAULT_SQL_QUERY_MAX_RESULT_BYTES: &str = "134217728"; // 128MB

impl SqlQueryError {
    fn sanitize_error(&self) -> String {
        match self {
            Self::ValidationError(e) => e.to_string(),
            Self::InternalError(e) => {
                let error_message = e.to_string();
                let without_settings = SETTING_REGEX.replace_all(&error_message, "");
                VERSION_REGEX.replace_all(&without_settings, "").to_string()
            }
        }
    }
}

impl std::fmt::Display for SqlQueryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ValidationError(_) => {
                write!(f, "Query validation failed: {}", self.sanitize_error())
            }
            Self::InternalError(_) => write!(f, "Error executing query: {}", self.sanitize_error()),
        }
    }
}

impl ClickhouseReadonlyClient {
    pub fn new(url: String, user: String, password: String) -> Self {
        let client = clickhouse::Client::default()
            .with_url(url)
            .with_user(user)
            .with_database("default")
            .with_password(password);

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
) -> Result<Vec<Value>, SqlQueryError> {
    let validation_result = query_engine.validate_query(query, project_id).await;

    let validated_query = match validation_result {
        Ok(QueryEngineValidationResult::Success { validated_query }) => validated_query,
        Ok(QueryEngineValidationResult::Error { error }) => {
            return Err(SqlQueryError::ValidationError(error));
        }
        Err(e) => {
            return Err(SqlQueryError::ValidationError(e.to_string()));
        }
    };

    let mut clickhouse_query = clickhouse_ro
        .query(&validated_query)
        .with_option("default_format", "JSON")
        .with_option("output_format_json_quote_64bit_integers", "0")
        .with_option(
            "max_execution_time",
            env::var("SQL_QUERY_MAX_EXECUTION_TIME")
                .as_ref()
                .map(|s| s.as_str())
                .unwrap_or(DEFAULT_SQL_QUERY_MAX_EXECUTION_TIME),
        )
        .with_option(
            "max_result_bytes",
            env::var("SQL_QUERY_MAX_RESULT_BYTES")
                .as_ref()
                .map(|s| s.as_str())
                .unwrap_or(DEFAULT_SQL_QUERY_MAX_RESULT_BYTES),
        );

    for (key, value) in parameters {
        clickhouse_query = clickhouse_query.param(&key, value);
    }

    let mut rows = clickhouse_query.fetch_bytes("JSON").map_err(|e| {
        SqlQueryError::InternalError(format!("Failed to execute ClickHouse query: {}", e))
    })?;

    let data = rows.collect().await.map_err(|e| match e {
        clickhouse::error::Error::BadResponse(e) => {
            let Ok(error) = serde_json::from_str::<ClickhouseBadResponseError>(&e) else {
                return SqlQueryError::InternalError(format!(
                    "Failed to parse ClickHouse error: {}",
                    e
                ));
            };
            let msg = error.exception.unwrap_or_default();
            log::warn!("Error executing user SQL query: {}", &msg);
            SqlQueryError::InternalError(msg)
        }
        _ => {
            log::error!("Failed to collect query response data: {}", e);
            SqlQueryError::InternalError(e.to_string())
        }
    })?;

    let results: Value = serde_json::from_slice(&data).map_err(|e| {
        log::error!("Failed to parse ClickHouse response as JSON: {}", e);
        SqlQueryError::InternalError(e.to_string())
    })?;

    let data_array = results
        .get("data")
        .ok_or(SqlQueryError::InternalError(
            "Response missing 'data' field".to_string(),
        ))?
        .as_array()
        .ok_or(SqlQueryError::InternalError(
            "Response 'data' field is not an array".to_string(),
        ))?;

    Ok(data_array.clone())
}
