use anyhow::Result;
use bytes::Bytes;
use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use uuid::Uuid;

use super::get_workspace_deployment;
use crate::db::workspaces::DeploymentMode;
use crate::db::workspaces::WorkspaceDeployment;
use crate::sql::{ClickhouseBadResponseError, ClickhouseReadonlyClient, SqlQueryError};
use crate::{cache::Cache, data_plane::auth::generate_auth_token};

use super::crypto;

const DEFAULT_SQL_QUERY_MAX_EXECUTION_TIME: &str = "120";
const DEFAULT_SQL_QUERY_MAX_RESULT_BYTES: &str = "536870912"; // 512MB

#[derive(Serialize, Debug)]
struct DataPlaneReadRequest {
    query: String,
    project_id: Uuid,
    parameters: HashMap<String, Value>,
}

// TODO: move read() and read_from_clickhouse() to sql module, keep only data plane interactions here

pub async fn read(
    pool: &PgPool,
    cache: Arc<Cache>,
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    http_client: Arc<reqwest::Client>,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
) -> Result<Bytes, SqlQueryError> {
    let config = get_workspace_deployment(pool, cache, project_id).await;
    let deployment_config = match config {
        Ok(config) => config,
        Err(e) => return Err(SqlQueryError::InternalError(e.to_string())),
    };

    match deployment_config.mode {
        DeploymentMode::CLOUD => {
            read_from_clickhouse(clickhouse_ro, project_id, query, parameters).await
        }
        DeploymentMode::HYBRID => {
            read_from_data_plane(
                &http_client,
                project_id,
                &deployment_config,
                query,
                parameters,
            )
            .await
        }
    }
}

async fn read_from_clickhouse(
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
) -> Result<Bytes, SqlQueryError> {
    let tracer = global::tracer("app-server");
    let mut span = tracer.start("execute_sql_query");

    span.set_attribute(KeyValue::new("sql.query", query.clone()));
    span.set_attribute(KeyValue::new("project_id", project_id.to_string()));
    let mut clickhouse_query = clickhouse_ro
        .query(&query)
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
                span.record_error(&std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                ));
                span.end();
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
    span.set_attribute(KeyValue::new("sql.response_bytes", data.len() as i64));
    span.end();

    return Ok(data);
}

async fn read_from_data_plane(
    http_client: &reqwest::Client,
    project_id: Uuid,
    config: &WorkspaceDeployment,
    query: String,
    parameters: HashMap<String, Value>,
) -> Result<Bytes, SqlQueryError> {
    let tracer = global::tracer("app-server");

    if config.data_plane_url.is_empty() {
        return Err(SqlQueryError::InternalError(
            "Data plane URL is empty".to_string(),
        ));
    }

    // Decrypt data_plane_url if present
    let data_plane_url = crypto::decrypt(
        config.workspace_id,
        &config.data_plane_url_nonce,
        &config.data_plane_url,
    )
    .map_err(|e| SqlQueryError::InternalError(e.to_string()))?;

    // Generate auth token
    let auth_token = generate_auth_token(config);
    let auth_token = match auth_token {
        Ok(token) => token,
        Err(e) => return Err(SqlQueryError::InternalError(e.to_string())),
    };

    let mut span = tracer.start("execute_data_plane_sql_query");
    span.set_attribute(KeyValue::new("sql.query", query.clone()));
    span.set_attribute(KeyValue::new("data_plane_url", data_plane_url.clone()));

    let request = DataPlaneReadRequest {
        query,
        project_id,
        parameters,
    };

    let response = http_client
        .post(format!("{}/api/v1/ch/read", data_plane_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            span.record_error(&e);
            span.end();
            SqlQueryError::InternalError(format!("Failed to send request to data plane: {}", e))
        })?;

    if !response.status().is_success() {
        let error_body = response
            .text()
            .await
            .unwrap_or_else(|_| "Failed to read error response body".to_string());

        let error: SqlQueryError = serde_json::from_str(&error_body).unwrap_or_else(|e| {
            SqlQueryError::InternalError(format!(
                "Failed to parse error response: {}. Body: {}",
                e, error_body
            ))
        });
        span.record_error(&std::io::Error::new(
            std::io::ErrorKind::Other,
            error.to_string(),
        ));
        span.end();
        return Err(error);
    }

    span.end();
    response
        .bytes()
        .await
        .map_err(|e| SqlQueryError::InternalError(e.to_string()))
}
