use anyhow::{Result, anyhow};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::tags::SpanTag;
use crate::{
    api::v1::browser_sessions::EventBatch,
    ch::{
        self, datapoints::CHDatapoint, evaluation_datapoint_outputs::CHEvaluationDatapointOutput,
        evaluation_scores::EvaluationScore, evaluator_scores::CHEvaluatorScore, events::CHEvent,
        spans::CHSpan, traces::CHTrace,
    },
    db::projects::DeploymentMode,
    evaluations::utils::EvaluationDatapointResult,
};

use crate::data_processor::{WorkspaceConfig, auth::generate_auth_token, get_workspace_config};

/// Tables that can be written to via the data plane
#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Table {
    Spans,
    Traces,
    Events,
    Tags,
    Datapoints,
    EvaluationDatapoints,
    EvaluationDatapointOutputs,
    EvaluationScores,
    EvaluatorScores,
    BrowserEvents,
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
        DeploymentMode::CLOUD => ch::spans::insert_spans_batch(clickhouse.clone(), spans).await?,
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
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

#[allow(dead_code)]
pub async fn write_traces(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    traces: &[CHTrace],
) -> Result<()> {
    if traces.is_empty() {
        return Ok(());
    }

    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::traces::upsert_traces_batch(clickhouse.clone(), traces).await?
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
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

#[allow(dead_code)]
pub async fn write_events(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    events: Vec<CHEvent>,
) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }

    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::events::insert_events(clickhouse.clone(), events).await?;
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
                &config,
                Table::Events,
                WriteData {
                    events: Some(events),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn write_tags(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    tags: &[SpanTag],
) -> Result<()> {
    if tags.is_empty() {
        return Ok(());
    }

    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::tags::insert_tags_batch(clickhouse.clone(), tags).await?;
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
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

#[allow(dead_code)]
pub async fn write_datapoints(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    datapoints: Vec<CHDatapoint>,
) -> Result<()> {
    if datapoints.is_empty() {
        return Ok(());
    }

    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::datapoints::insert_datapoints(clickhouse.clone(), datapoints).await?;
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
                &config,
                Table::Datapoints,
                WriteData {
                    datapoints: Some(datapoints),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn write_evaluation_datapoints(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    evaluation_id: Uuid,
    evaluation_datapoints: Vec<EvaluationDatapointResult>,
) -> Result<()> {
    if evaluation_datapoints.is_empty() {
        return Ok(());
    }

    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::evaluation_datapoints::insert_evaluation_datapoints(
                clickhouse.clone(),
                evaluation_datapoints,
                evaluation_id,
                project_id,
            )
            .await?;
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
                &config,
                Table::EvaluationDatapoints,
                WriteData {
                    evaluation_datapoints: Some(evaluation_datapoints),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn write_evaluation_datapoint_outputs(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    outputs: Vec<CHEvaluationDatapointOutput>,
) -> Result<()> {
    if outputs.is_empty() {
        return Ok(());
    }

    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::evaluation_datapoint_outputs::insert_evaluation_datapoint_outputs(
                clickhouse.clone(),
                outputs,
            )
            .await?;
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
                &config,
                Table::EvaluationDatapointOutputs,
                WriteData {
                    evaluation_datapoint_outputs: Some(outputs),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn write_evaluation_scores(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    scores: Vec<EvaluationScore>,
) -> Result<()> {
    if scores.is_empty() {
        return Ok(());
    }

    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::evaluation_scores::insert_evaluation_scores(clickhouse.clone(), scores).await?;
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
                &config,
                Table::EvaluationScores,
                WriteData {
                    evaluation_scores: Some(scores),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn write_evaluator_score(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    id: Uuid,
    name: &str,
    source: crate::db::evaluators::EvaluatorScoreSource,
    span_id: Uuid,
    evaluator_id: Option<Uuid>,
    score: f64,
) -> Result<()> {
    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::evaluator_scores::insert_evaluator_score_ch(
                clickhouse.clone(),
                id,
                project_id,
                name,
                source,
                span_id,
                evaluator_id,
                score,
            )
            .await?;
        }
        DeploymentMode::HYBRID => {
            let score_obj =
                CHEvaluatorScore::new(id, project_id, name, source, span_id, evaluator_id, score);
            write_to_data_plane(
                http_client,
                project_id,
                &config,
                Table::EvaluatorScores,
                WriteData {
                    evaluator_score: Some(score_obj),
                    ..Default::default()
                },
            )
            .await?
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn write_browser_events(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    http_client: &reqwest::Client,
    project_id: Uuid,
    event_batch: &EventBatch,
) -> Result<()> {
    let config = get_workspace_config(pool, project_id).await?;

    match config.deployment_mode {
        DeploymentMode::CLOUD => {
            ch::browser_events::insert_browser_events(clickhouse, project_id, event_batch).await?;
        }
        DeploymentMode::HYBRID => {
            write_to_data_plane(
                http_client,
                project_id,
                &config,
                Table::BrowserEvents,
                WriteData {
                    browser_events: Some(event_batch.clone()),
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
    project_id: Uuid,
    config: &WorkspaceConfig,
    table: Table,
    data: WriteData,
) -> Result<()> {
    let data_plane_url = config.data_plane_url.as_ref().ok_or_else(|| {
        anyhow!(
            "HYBRID deployment requires data_plane_url for project {}",
            project_id
        )
    })?;

    let auth_token = generate_auth_token(config.workspace_id)
        .map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

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
