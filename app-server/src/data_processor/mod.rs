pub mod auth;

use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;

use anyhow::{Result, anyhow};
use bytes::Bytes;
use moka::future::Cache;
use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::sql::{ClickhouseBadResponseError, ClickhouseReadonlyClient, SqlQueryError};
use crate::{
    ch::{self, spans::CHSpan},
    db::projects::{DeploymentMode, get_workspace_by_project_id},
};

use self::auth::generate_auth_token;

const DEFAULT_SQL_QUERY_MAX_EXECUTION_TIME: &str = "120";
const DEFAULT_SQL_QUERY_MAX_RESULT_BYTES: &str = "536870912"; // 512MB

const WORKSPACE_CONFIG_CACHE_TTL_SECS: u64 = 60 * 60;
static WORKSPACE_CONFIG_CACHE: OnceLock<Cache<Uuid, WorkspaceConfig>> = OnceLock::new();

fn get_cache() -> &'static Cache<Uuid, WorkspaceConfig> {
    WORKSPACE_CONFIG_CACHE.get_or_init(|| {
        Cache::builder()
            .time_to_live(Duration::from_secs(WORKSPACE_CONFIG_CACHE_TTL_SECS))
            .build()
    })
}

#[derive(Clone, Debug)]
struct WorkspaceConfig {
    workspace_id: Uuid,
    deployment_mode: DeploymentMode,
    data_plane_url: Option<String>,
}

async fn get_workspace_config(pool: &PgPool, project_id: Uuid) -> Result<WorkspaceConfig> {
    let cache = get_cache();

    if let Some(config) = cache.get(&project_id).await {
        return Ok(config);
    }

    let workspace = get_workspace_by_project_id(pool, &project_id).await?;

    let config = WorkspaceConfig {
        workspace_id: workspace.id,
        deployment_mode: workspace.deployment_mode,
        data_plane_url: workspace.data_plane_url,
    };

    cache.insert(project_id, config.clone()).await;

    Ok(config)
}

/// Tables that can be written to via the data plane
#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Table {
    Spans,
    // Add more tables here as needed (e.g., Events, Traces)
}

/// Data payload for write requests
#[derive(Serialize)]
pub struct WriteData<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spans: Option<&'a [CHSpan]>,
    // Add more fields here as needed (e.g., events, traces)
}

#[derive(Serialize)]
struct DataPlaneWriteRequest<'a> {
    table: Table,
    data: WriteData<'a>,
}

#[derive(Serialize)]
struct DataPlaneReadRequest {
    query: String,
}

pub async fn write_spans(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    spans: &[CHSpan],
) -> Result<()> {
    if spans.is_empty() {
        return Ok(());
    }

    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => write_spans_to_clickhouse(clickhouse, spans).await,
        DeploymentMode::HYBRID => {
            write_spans_to_data_plane(http_client, project_id, &config, spans).await
        }
    }
}

async fn write_spans_to_clickhouse(
    clickhouse: &clickhouse::Client,
    spans: &[CHSpan],
) -> Result<()> {
    ch::spans::insert_spans_batch(clickhouse.clone(), spans).await
}

async fn write_spans_to_data_plane(
    http_client: &reqwest::Client,
    project_id: Uuid,
    config: &WorkspaceConfig,
    spans: &[CHSpan],
) -> Result<()> {
    let data_plane_url = config.data_plane_url.as_ref().ok_or_else(|| {
        anyhow!(
            "HYBRID deployment requires data_plane_url for project {}",
            project_id
        )
    })?;

    let auth_token = generate_auth_token(config.workspace_id)
        .map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

    let response = http_client
        .post(format!("{}/clickhouse/write", data_plane_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("Content-Type", "application/json")
        .json(&DataPlaneWriteRequest {
            table: Table::Spans,
            data: WriteData { spans: Some(spans) },
        })
        .send()
        .await?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(anyhow!(
            "Data plane returned {}: {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ))
    }
}

pub async fn read(
    pool: &PgPool,
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    http_client: Arc<reqwest::Client>,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
) -> Result<Bytes> {
    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            read_from_clickhouse(clickhouse_ro, project_id, query, parameters).await
        }
        DeploymentMode::HYBRID => {
            read_from_data_plane(&http_client, project_id, &config, query).await
        }
    }
}

async fn read_from_clickhouse(
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
) -> Result<Bytes> {
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
    config: &WorkspaceConfig,
    query: String,
) -> Result<Bytes> {
    let tracer = global::tracer("app-server");

    let data_plane_url = config.data_plane_url.as_ref().ok_or_else(|| {
        anyhow!(
            "HYBRID deployment requires data_plane_url for project {}",
            project_id
        )
    })?;

    let auth_token = generate_auth_token(config.workspace_id)
        .map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

    let mut span = tracer.start("execute_data_plane_sql_query");
    span.set_attribute(KeyValue::new("sql.query", query.clone()));
    span.set_attribute(KeyValue::new("data_plane_url", data_plane_url.clone()));

    let response = http_client
        .post(format!("{}/clickhouse/read", data_plane_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("Content-Type", "application/json")
        .json(&DataPlaneReadRequest { query })
        .send()
        .await
        .map_err(|e| {
            span.record_error(&e);
            span.end();
            SqlQueryError::InternalError(format!("Failed to send request to data plane: {}", e))
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        span.record_error(&std::io::Error::new(
            std::io::ErrorKind::Other,
            error_text.clone(),
        ));
        span.end();
        return Err(anyhow!(
            "Data plane returned error {}: {}",
            status,
            error_text
        ));
    }

    return response.bytes().await.map_err(|e| anyhow!(e));
}
