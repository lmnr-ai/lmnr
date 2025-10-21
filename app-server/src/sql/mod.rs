pub mod queries;

use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use regex::Regex;
use serde::Deserialize;
use serde_json::{Value, json};
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
    BadResponseError(String),
    InternalError(String),
}

#[derive(Deserialize)]
struct ClickhouseBadResponseError {
    #[serde(default)]
    exception: Option<String>,
}

const VERSION_REGEX_RAW: &str = r"\s*\(version\s+\d+(?:\.\d+){0,3}(?:\s+\([^)]*\))?\)$";

// Removes any settings explicitly set in the query.
const SETTING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s*SETTINGS\s+[A-Za-z_]*\s*=\s*'(?:[^'\\]|\\.)*'(?:\s*,\s*[A-Za-z_]*\s*=\s*'(?:[^'\\]|\\.)*')*\s*").unwrap()
});
// Removes clickhouse version info from the end of the error message.
const VERSION_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(VERSION_REGEX_RAW).unwrap());

const ERROR_END_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(format!(r"\. \([A-Z_]+\)*{VERSION_REGEX_RAW}").as_str()).unwrap());

const DEFAULT_SQL_QUERY_MAX_EXECUTION_TIME: &str = "120";
const DEFAULT_SQL_QUERY_MAX_RESULT_BYTES: &str = "536870912"; // 512MB

impl SqlQueryError {
    fn sanitize_error(&self) -> String {
        match self {
            Self::ValidationError(e) => e.to_string(),
            Self::InternalError(e) => remove_query_from_error_message(e),
            Self::BadResponseError(e) => remove_query_from_error_message(e),
        }
    }
}

impl std::fmt::Display for SqlQueryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let prefix = match self {
            Self::ValidationError(_) => "Query validation failed",
            Self::InternalError(_) => "Error executing query",
            Self::BadResponseError(_) => "Error executing query",
        };
        let error_message = format!("{prefix}: {}", self.sanitize_error());
        write!(f, "{}", json!({"error": error_message}))
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
    let tracer = global::tracer("app-server");

    let mut span = tracer.start("call_query_engine");
    span.set_attribute(KeyValue::new("sql.query", query.clone()));
    span.set_attribute(KeyValue::new("project_id", project_id.to_string()));
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
    span.end();

    let mut span = tracer.start("execute_sql_query");
    span.set_attribute(KeyValue::new("sql.query", validated_query.clone()));
    span.set_attribute(KeyValue::new("project_id", project_id.to_string()));
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
        span.set_attribute(KeyValue::new(
            format!("sql.parameters.{key}"),
            value.to_string(),
        ));
        clickhouse_query = clickhouse_query.param(&key, value);
    }

    let mut rows = clickhouse_query.fetch_bytes("JSON").map_err(|e| {
        span.record_error(&e);
        span.end();
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
            span.record_error(&std::io::Error::new(std::io::ErrorKind::Other, e));
            span.end();
            log::warn!("Error executing user SQL query: {}", &msg);
            SqlQueryError::BadResponseError(msg)
        }
        _ => {
            span.record_error(&e);
            span.end();
            log::error!("Failed to collect query response data: {}", e);
            SqlQueryError::InternalError(e.to_string())
        }
    })?;
    span.end();

    let mut processing_span = tracer.start("process_query_response");

    let results: Value = serde_json::from_slice(&data).map_err(|e| {
        log::error!("Failed to parse ClickHouse response as JSON: {}", e);
        processing_span.record_error(&e);
        processing_span.end();
        SqlQueryError::InternalError(e.to_string())
    })?;

    let data_array = results
        .get("data")
        .ok_or_else(|| {
            let msg = "Response missing 'data' field".to_string();
            processing_span.record_error(&SqlQueryError::InternalError(msg.clone()));
            processing_span.end();
            SqlQueryError::InternalError(msg)
        })?
        .as_array()
        .ok_or_else(|| {
            let msg = "Response 'data' field is not an array".to_string();
            processing_span.record_error(&SqlQueryError::InternalError(msg.clone()));
            processing_span.end();
            SqlQueryError::InternalError(msg)
        })?;

    processing_span.end();

    Ok(data_array.clone())
}

fn find_query_start_idx(error_message: &str) -> Option<usize> {
    error_message
        .find("In scope")
        .or(error_message.find("In query"))
        .or(error_message.find("WITH").or(error_message.find("SELECT")))
        .or(error_message.find("AS"))
}

fn remove_query_from_error_message(error_message: &str) -> String {
    let query_start_idx = find_query_start_idx(&error_message);
    let error_code_idx = ERROR_END_REGEX
        .find(&error_message)
        // +2 to skip the dot at the beginning of the error code
        .map(|m| m.start() + 2)
        .unwrap_or(error_message.len());
    // remove the query from the error message
    let error_message = format!(
        "{}{}",
        if let Some(query_start_idx) = query_start_idx {
            &error_message[..query_start_idx]
        } else {
            &error_message[..error_code_idx]
        },
        &error_message[error_code_idx..]
    );
    // Although settings are part of the query, they won't be removed if
    // we fail to locate the query in the first place, so as a safety measure
    // also remove them manually
    let without_settings = SETTING_REGEX.replace_all(&error_message, "").to_string();
    VERSION_REGEX.replace_all(&without_settings, "").to_string()
}
