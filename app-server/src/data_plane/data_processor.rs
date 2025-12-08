//! Data processor handles routing reads/writes to the appropriate backend
//! based on the workspace's deployment mode (CLOUD vs HYBRID).

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;

use anyhow::{Result, anyhow};
use moka::future::Cache;
use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::query_engine::QueryEngine;
use crate::sql::{ClickhouseReadonlyClient, SqlQueryError, execute_sql_query, validate_query};
use crate::{
    ch::{self, spans::CHSpan},
    db::projects::{DeploymentMode, get_workspace_by_project_id},
};

use super::auth::generate_auth_token;

const WORKSPACE_CONFIG_CACHE_TTL_SECS: u64 = 60 * 60; // 1 hour

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
    query_engine: Arc<QueryEngine>,
    project_id: Uuid,
    query: String,
) -> Result<Vec<Value>> {
    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            read_from_clickhouse(clickhouse_ro, query_engine, project_id, query).await
        }
        DeploymentMode::HYBRID => {
            read_from_data_plane(&http_client, query_engine, project_id, &config, query).await
        }
    }
}

async fn read_from_clickhouse(
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    query_engine: Arc<QueryEngine>,
    project_id: Uuid,
    query: String,
) -> Result<Vec<Value>> {
    let results = execute_sql_query(
        query,
        project_id,
        HashMap::new(),
        clickhouse_ro,
        query_engine,
    )
    .await
    .map_err(|e| anyhow!("Failed to execute query: {}", e))?;

    Ok(results)
}

async fn read_from_data_plane(
    http_client: &reqwest::Client,
    query_engine: Arc<QueryEngine>,
    project_id: Uuid,
    config: &WorkspaceConfig,
    query: String,
) -> Result<Vec<Value>> {
    let tracer = global::tracer("app-server");

    // Validate query first
    // TODO: move this function inside read() function above after all execute_sql_query() calls are done via data processor
    let validated_query = match validate_query(query, project_id, query_engine).await {
        Ok(validated_query) => validated_query,
        Err(e) => {
            return Err(e.into());
        }
    };

    let data_plane_url = config.data_plane_url.as_ref().ok_or_else(|| {
        anyhow!(
            "HYBRID deployment requires data_plane_url for project {}",
            project_id
        )
    })?;

    let auth_token = generate_auth_token(config.workspace_id)
        .map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

    let mut span = tracer.start("execute_data_plane_sql_query");
    span.set_attribute(KeyValue::new("sql.query", validated_query.clone()));
    span.set_attribute(KeyValue::new("data_plane_url", data_plane_url.clone()));

    let response = http_client
        .post(format!("{}/clickhouse/read", data_plane_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("Content-Type", "application/json")
        .json(&DataPlaneReadRequest {
            query: validated_query,
        })
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

    let data = response.bytes().await.map_err(|e| {
        span.record_error(&e);
        span.end();
        SqlQueryError::InternalError(format!("Failed to read response: {}", e))
    })?;
    span.set_attribute(KeyValue::new("sql.response_bytes", data.len() as i64));
    span.end();

    let mut processing_span = tracer.start("process_query_response");

    let results: Value = serde_json::from_slice(&data).map_err(|e| {
        log::error!("Failed to parse data plane response as JSON: {}", e);
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
