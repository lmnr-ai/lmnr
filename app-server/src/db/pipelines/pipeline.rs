use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Pipeline {
    pub id: Option<Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub project_id: Uuid,
    pub name: String,
    pub visibility: String,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PipelineWithTargetVersion {
    pub id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub project_id: Uuid,
    pub name: String,
    pub visibility: String,
    pub target_version_id: Option<Uuid>,
}

pub async fn write_pipeline(
    pool: &PgPool,
    id: Uuid,
    project_id: Uuid,
    name: &String,
    visibility: &String,
) -> Result<Pipeline> {
    let pipeline = sqlx::query_as!(
        Pipeline,
        "INSERT INTO pipelines (id, project_id, name, visibility) values ($1, $2, $3, $4)
        RETURNING id, created_at, project_id, name, visibility",
        id,
        project_id,
        name,
        visibility,
    )
    .fetch_one(pool)
    .await?;

    Ok(pipeline)
}

pub async fn get_pipeline_by_id(
    pool: &PgPool,
    pipeline_id: &Uuid,
) -> Result<PipelineWithTargetVersion> {
    let pipeline = sqlx::query_as!(
        PipelineWithTargetVersion,
        r#"SELECT
            pipelines.id,
            pipelines.created_at,
            pipelines.name,
            pipelines.project_id,
            pipelines.visibility,
            target_pipeline_versions.pipeline_version_id as "target_version_id?"
        FROM
            pipelines
        LEFT JOIN target_pipeline_versions ON target_pipeline_versions.pipeline_id = pipelines.id
        WHERE
            pipelines.id = $1"#,
        pipeline_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(pipeline)
}

pub async fn delete_pipeline(pool: &PgPool, pipeline_id: &Uuid) -> Result<()> {
    sqlx::query!("DELETE FROM pipelines WHERE id = $1;", pipeline_id,)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn update_pipeline(pool: &PgPool, pipeline: &Pipeline) -> Result<Pipeline> {
    let updated_pipeline = sqlx::query_as!(
        Pipeline,
        "UPDATE pipelines SET name = $2, visibility = $3 WHERE id = $1
        RETURNING id, created_at, project_id, name, visibility",
        pipeline.id,
        pipeline.name,
        pipeline.visibility,
    )
    .fetch_optional(pool)
    .await?;

    updated_pipeline.context("pipeline doesn't exist")
}

pub async fn get_pipeline_by_version_id(pool: &PgPool, version_id: &Uuid) -> Result<Pipeline> {
    let pipeline = sqlx::query_as!(
        Pipeline,
        "SELECT id, created_at, project_id, name, visibility
        FROM pipelines
        WHERE id = (SELECT pipeline_id FROM pipeline_versions WHERE id = $1)",
        version_id,
    )
    .fetch_optional(pool)
    .await?;

    pipeline.context("pipeline not found")
}

pub async fn get_pipelines_of_project(
    pool: &PgPool,
    project_id: &Uuid,
) -> Result<Vec<PipelineWithTargetVersion>> {
    let res = sqlx::query_as!(
        PipelineWithTargetVersion,
        r#"SELECT
          pipelines.id,
          pipelines.created_at,
          pipelines.name,
          pipelines.project_id,
          pipelines.visibility,
          target_pipeline_versions.pipeline_version_id as "target_version_id?"
      FROM
          pipelines
      LEFT JOIN target_pipeline_versions ON target_pipeline_versions.pipeline_id = pipelines.id
      WHERE
          pipelines.project_id = $1
      ORDER BY
          pipelines.created_at DESC;"#,
        project_id
    )
    .fetch_all(pool)
    .await?;
    Ok(res)
}
