pub mod ch;
pub mod data_plane;
pub mod queries;

use bytes::Bytes;
use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use regex::Regex;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock},
};
use uuid::Uuid;

use crate::{
    cache::Cache,
    data_plane::get_workspace_deployment,
    db::{DB, workspaces::DeploymentMode},
    query_engine::{QueryEngine, QueryEngineTrait, QueryEngineValidationResult},
};

pub struct ClickhouseReadonlyClient(clickhouse::Client);

#[derive(Debug, thiserror::Error, Deserialize)]
pub enum SqlQueryError {
    ValidationError(String),
    BadResponseError(String),
    InternalError(String),
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
    http_client: Arc<reqwest::Client>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> Result<Vec<Value>, SqlQueryError> {
    let tracer = global::tracer("app-server");

    // Validate query first
    let validated_query = match validate_query(query, project_id, query_engine).await {
        Ok(validated_query) => validated_query,
        Err(e) => {
            return Err(e);
        }
    };

    // Execute query
    let res = route_and_run_query(
        &db.pool,
        cache,
        clickhouse_ro,
        http_client,
        project_id,
        validated_query,
        parameters,
    )
    .await;

    let data = match res {
        Ok(data) => data,
        Err(e) => {
            return Err(e);
        }
    };

    // Process query response
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

// Validates the query using the query engine.
pub async fn validate_query(
    query: String,
    project_id: Uuid,
    query_engine: Arc<QueryEngine>,
) -> Result<String, SqlQueryError> {
    let tracer = global::tracer("app-server");
    let mut span = tracer.start("validate_sql_query");
    span.set_attribute(KeyValue::new("sql.query", query.clone()));
    span.set_attribute(KeyValue::new("project_id", project_id.to_string()));

    let validation_result = query_engine.validate_query(query, project_id).await;

    let validated_query = match validation_result {
        Ok(QueryEngineValidationResult::Success { validated_query }) => validated_query,
        Ok(QueryEngineValidationResult::Error { error }) => {
            span.record_error(&std::io::Error::new(
                std::io::ErrorKind::Other,
                error.clone(),
            ));
            span.end();
            return Err(SqlQueryError::ValidationError(error));
        }
        Err(e) => {
            span.record_error(&std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ));
            span.end();
            return Err(SqlQueryError::ValidationError(e.to_string()));
        }
    };
    span.end();

    Ok(validated_query)
}

// Routes the query to the appropriate backend and runs it.
pub async fn route_and_run_query(
    pool: &PgPool,
    cache: Arc<Cache>,
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    http_client: Arc<reqwest::Client>,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
) -> Result<Bytes, SqlQueryError> {
    let config = get_workspace_deployment(pool, cache.clone(), project_id).await;
    let deployment_config = match config {
        Ok(config) => config,
        Err(e) => return Err(SqlQueryError::InternalError(e.to_string())),
    };

    match deployment_config.mode {
        DeploymentMode::CLOUD => ch::query(clickhouse_ro, project_id, query, parameters).await,
        DeploymentMode::HYBRID => {
            data_plane::query(
                cache,
                http_client,
                deployment_config,
                project_id,
                query,
                parameters,
            )
            .await
        }
    }
}
