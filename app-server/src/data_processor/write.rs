use anyhow::{Result, anyhow};
use serde::Serialize;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::data_processor::{auth::generate_auth_token, get_workspace_deployment};
use crate::db::tags::SpanTag;
use crate::db::workspaces::WorkspaceDeployment;
use crate::{
    api::v1::browser_sessions::EventBatch,
    cache::Cache,
    ch::{
        self, datapoints::CHDatapoint, evaluation_datapoint_outputs::CHEvaluationDatapointOutput,
        evaluation_scores::EvaluationScore, evaluator_scores::CHEvaluatorScore, events::CHEvent,
        spans::CHSpan, traces::CHTrace,
    },
    db::workspaces::DeploymentMode,
    evaluations::utils::EvaluationDatapointResult,
};

use super::crypto;

/// Tables that can be written to via the data plane
#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Table {
    Spans,
    Traces,
    Tags,
}

/// Data payload for write requests
#[serde_with::skip_serializing_none]
#[derive(Serialize, Default)]
pub struct WriteData {
    pub spans: Option<Vec<CHSpan>>,
    pub traces: Option<Vec<CHTrace>>,
    pub events: Option<Vec<CHEvent>>,
    pub tags: Option<Vec<SpanTag>>,
    pub datapoints: Option<Vec<CHDatapoint>>,
    pub evaluation_datapoints: Option<Vec<EvaluationDatapointResult>>,
    pub evaluation_datapoint_outputs: Option<Vec<CHEvaluationDatapointOutput>>,
    pub evaluation_scores: Option<Vec<EvaluationScore>>,
    pub evaluator_score: Option<CHEvaluatorScore>,
    pub browser_events: Option<EventBatch>,
}

#[derive(Serialize)]
struct DataPlaneWriteRequest {
    table: Table,
    data: WriteData,
}

pub async fn write_spans(
    pool: &PgPool,
    cache: Arc<Cache>,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    spans: &[CHSpan],
) -> Result<()> {
    if spans.is_empty() {
        return Ok(());
    }

    let config = get_workspace_deployment(pool, cache, project_id).await?;

    match config.mode {
        DeploymentMode::CLOUD => ch::spans::insert_spans_batch(clickhouse.clone(), spans).await?,
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                &config,
                Table::Spans,
                WriteData {
                    spans: Some(spans.to_vec()),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

pub async fn write_traces(
    pool: &PgPool,
    cache: Arc<Cache>,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    traces: &[CHTrace],
) -> Result<()> {
    if traces.is_empty() {
        return Ok(());
    }

    let config = get_workspace_deployment(pool, cache, project_id).await?;

    match config.mode {
        DeploymentMode::CLOUD => {
            ch::traces::upsert_traces_batch(clickhouse.clone(), traces).await?
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                &config,
                Table::Traces,
                WriteData {
                    traces: Some(traces.to_vec()),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

pub async fn write_tags(
    pool: &PgPool,
    cache: Arc<Cache>,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    tags: &[SpanTag],
) -> Result<()> {
    if tags.is_empty() {
        return Ok(());
    }

    let config = get_workspace_deployment(pool, cache, project_id).await?;

    match config.mode {
        DeploymentMode::CLOUD => {
            ch::tags::insert_tags_batch(clickhouse.clone(), tags).await?;
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                &config,
                Table::Tags,
                WriteData {
                    tags: Some(tags.to_vec()),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

async fn write_to_data_plane(
    http_client: &reqwest::Client,
    config: &WorkspaceDeployment,
    table: Table,
    data: WriteData,
) -> Result<()> {
    if config.data_plane_url.is_empty() {
        return Err(anyhow!("Data plane URL is empty"));
    }

    // Decrypt data_plane_url if present
    let data_plane_url = crypto::decrypt_workspace_str(
        config.workspace_id,
        &config.data_plane_url_nonce,
        &config.data_plane_url,
    )
    .map_err(|e| anyhow!(e.to_string()))?;

    let auth_token =
        generate_auth_token(config).map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

    let request = DataPlaneWriteRequest {
        table: table,
        data: data,
    };

    let response = http_client
        .post(format!("{}/api/v1/write", data_plane_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("Content-Type", "application/json")
        .json(&request)
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
