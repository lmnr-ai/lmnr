use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

// needs to be clonable in order to be cached
#[derive(Clone, Debug, Default, Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PipelineVersion {
    #[serde(default)]
    pub id: Uuid,
    pub pipeline_id: Uuid,
    pub pipeline_type: String,
    pub name: String,
    pub displayable_graph: Value,
    pub runnable_graph: Value,
    #[serde(default)]
    pub created_at: DateTime<Utc>,
}

#[derive(FromRow)]
pub struct PipelineVersionWithPipelineName {
    pub id: Uuid,
    pub pipeline_id: Uuid,
    pub pipeline_type: String,
    pub name: String,
    pub displayable_graph: Value,
    pub runnable_graph: Value,
    pub created_at: DateTime<Utc>,
    pub pipeline_name: String,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TargetPipelineVersion {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub pipeline_id: Uuid,
    pub pipeline_version_id: Uuid,
}

#[derive(Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PipelineVersionInfo {
    pub id: Uuid,
    pub pipeline_id: Uuid,
    pub pipeline_type: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

pub async fn get_pipeline_versions(
    pool: &PgPool,
    pipeline_id: &Uuid,
) -> Result<Vec<PipelineVersion>> {
    Ok(sqlx::query_as!(
        PipelineVersion,
        "SELECT
            id,
            pipeline_id,
            pipeline_type,
            name,
            displayable_graph,
            runnable_graph,
            created_at
        FROM
            pipeline_versions
        WHERE
            pipeline_id = $1
        ORDER BY
            created_at DESC",
        pipeline_id
    )
    .fetch_all(pool)
    .await?)
}

pub async fn get_commit_pipeline_versions_info(
    pool: &PgPool,
    pipeline_id: &Uuid,
) -> Result<Vec<PipelineVersionInfo>> {
    Ok(sqlx::query_as!(
        PipelineVersionInfo,
        "SELECT
                pipeline_versions.id,
                pipeline_versions.name,
                pipeline_versions.pipeline_id,
                pipeline_versions.pipeline_type,
                pipeline_versions.created_at
            FROM
                pipeline_versions
            WHERE
                pipeline_versions.pipeline_id = $1
            AND
                pipeline_versions.pipeline_type = 'COMMIT'
            ORDER BY
                pipeline_versions.created_at DESC",
        pipeline_id
    )
    .fetch_all(pool)
    .await?)
}

pub async fn get_pipeline_versions_info(
    pool: &PgPool,
    pipeline_id: &Uuid,
) -> Result<Vec<PipelineVersionInfo>> {
    Ok(sqlx::query_as!(
        PipelineVersionInfo,
        "SELECT
                pipeline_versions.id,
                pipeline_versions.name,
                pipeline_versions.pipeline_id,
                pipeline_versions.pipeline_type,
                pipeline_versions.created_at
            FROM
                pipeline_versions
            WHERE
                pipeline_versions.pipeline_id = $1
            ORDER BY
                pipeline_versions.created_at DESC",
        pipeline_id
    )
    .fetch_all(pool)
    .await?)
}

pub async fn create_pipeline_version(
    pool: &PgPool,
    id: Uuid,
    pipeline_id: Uuid,
    pipeline_type: &str,
    name: &str,
    displayable_graph: &Value,
    runnable_graph: &Value,
) -> Result<PipelineVersion> {
    let pipeline_version = sqlx::query_as!(
        PipelineVersion,
        "INSERT INTO pipeline_versions (id, pipeline_id, pipeline_type, name, displayable_graph, runnable_graph) 
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, pipeline_id, pipeline_type, name, displayable_graph, runnable_graph, created_at",
        id,
        pipeline_id,
        pipeline_type,
        name,
        displayable_graph,
        runnable_graph
    )
    .fetch_one(pool)
    .await?;

    Ok(pipeline_version)
}

pub async fn clone_pipeline_version(
    pool: &PgPool,
    ref_pipeline_version_id: Uuid,
    new_pipeline_version_name: &str,
    new_pipeline_version_type: &str,
) -> Result<Uuid> {
    let pipeline_version = sqlx::query_as!(
        PipelineVersion,
        "INSERT INTO pipeline_versions (pipeline_id, pipeline_type, name, displayable_graph, runnable_graph) 
        SELECT pipeline_id, $1, $2, displayable_graph, runnable_graph FROM pipeline_versions WHERE id = $3
        RETURNING id, pipeline_id, pipeline_type, name, displayable_graph, runnable_graph, created_at",
        new_pipeline_version_type,
        new_pipeline_version_name,
        ref_pipeline_version_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(pipeline_version.id)
}

pub async fn clone_pipeline_version_to_pipeline(
    pool: &PgPool,
    ref_pipeline_version_id: Uuid,
    pipeline_id: Uuid,
    new_pipeline_version_name: &str,
    new_pipeline_version_type: &str,
) -> Result<PipelineVersion> {
    let pipeline_version = sqlx::query_as!(
        PipelineVersion,
        "INSERT INTO pipeline_versions (pipeline_id, pipeline_type, name, displayable_graph, runnable_graph) 
        SELECT $2, $3, $4, displayable_graph, runnable_graph FROM pipeline_versions WHERE id = $1
        RETURNING id, pipeline_id, pipeline_type, name, displayable_graph, runnable_graph, created_at",
        ref_pipeline_version_id,
        pipeline_id,
        new_pipeline_version_type,
        new_pipeline_version_name,
    )
    .fetch_one(pool)
    .await?;

    Ok(pipeline_version)
}

/// Overwrite pipeline version's graph without changing the pipeline name and type
pub async fn overwrite_graph(
    pool: &PgPool,
    ref_pipeline_version_id: Uuid,
    workshop_pipeline_version_id: Uuid,
) -> Result<()> {
    sqlx::query!(
        "WITH ref_version AS (
            SELECT
                pipeline_versions.id,
                pipeline_versions.pipeline_id,
                pipeline_versions.pipeline_type,
                pipeline_versions.name,
                pipeline_versions.displayable_graph,
                pipeline_versions.runnable_graph,
                pipeline_versions.created_at
            FROM
                pipeline_versions
            WHERE
                pipeline_versions.id = $1
        )
        UPDATE pipeline_versions SET
            displayable_graph = ref_version.displayable_graph,
            runnable_graph = ref_version.runnable_graph
        FROM ref_version
            WHERE pipeline_versions.id = $2",
        ref_pipeline_version_id,
        workshop_pipeline_version_id,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_pipeline_version(pool: &PgPool, version_id: &Uuid) -> Result<PipelineVersion> {
    let version = sqlx::query_as!(
        PipelineVersion,
        "SELECT
            pipeline_versions.id,
            pipeline_versions.pipeline_id,
            pipeline_versions.pipeline_type,
            pipeline_versions.name,
            pipeline_versions.displayable_graph,
            pipeline_versions.runnable_graph,
            pipeline_versions.created_at
        FROM
            pipeline_versions
        WHERE
            pipeline_versions.id = $1",
        version_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(version)
}

pub async fn get_pipeline_version_with_pipeline_name(
    pool: &PgPool,
    version_id: &Uuid,
) -> Result<PipelineVersionWithPipelineName> {
    let version = sqlx::query_as!(
        PipelineVersionWithPipelineName,
        "SELECT
            pipeline_versions.id,
            pipeline_versions.pipeline_id,
            pipeline_versions.pipeline_type,
            pipeline_versions.name,
            pipeline_versions.displayable_graph,
            pipeline_versions.runnable_graph,
            pipeline_versions.created_at,
            pipelines.name as pipeline_name
        FROM
            pipeline_versions
        JOIN
            pipelines ON pipeline_versions.pipeline_id = pipelines.id
        WHERE
            pipeline_versions.id = $1",
        version_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(version)
}

pub async fn create_or_update_target_pipeline_version(
    pool: &PgPool,
    pipeline_id: Uuid,
    pipeline_version_id: Uuid,
) -> Result<TargetPipelineVersion> {
    // For now, (pipeline_id) is UNIQUE, but is subject to change upon extending this table
    let target = sqlx::query_as!(
        TargetPipelineVersion,
        "INSERT INTO target_pipeline_versions (pipeline_id, pipeline_version_id)
        VALUES ($1, $2)
        ON CONFLICT (pipeline_id) DO UPDATE SET pipeline_version_id = $2
        RETURNING id, created_at, pipeline_id, pipeline_version_id",
        pipeline_id,
        pipeline_version_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(target)
}

pub async fn get_target_pipeline_version_by_pipeline_name(
    pool: &PgPool,
    project_id: Uuid,
    pipeline_name: &str,
) -> Result<Option<PipelineVersion>> {
    let version = sqlx::query_as!(
        PipelineVersion,
        "SELECT
            pipeline_versions.id,
            pipeline_versions.pipeline_id,
            pipeline_versions.pipeline_type,
            pipeline_versions.name,
            pipeline_versions.displayable_graph,
            pipeline_versions.runnable_graph,
            pipeline_versions.created_at
        FROM
            pipeline_versions
        WHERE
            pipeline_versions.id = (
                SELECT pipeline_version_id
                FROM target_pipeline_versions
                WHERE pipeline_id = (
                    SELECT pipelines.id
                    FROM pipelines
                    WHERE project_id = $1 AND name = $2
                )
        )",
        project_id,
        pipeline_name,
    )
    .fetch_optional(pool)
    .await?;

    Ok(version)
}

/// Update a pipeline version in the database
///
/// Note: Use only for workshop pipeline versions.
pub async fn update_pipeline_version(pool: &PgPool, version: &PipelineVersion) -> Result<()> {
    sqlx::query!(
        "UPDATE pipeline_versions SET name = $1, displayable_graph = $2, runnable_graph = $3 WHERE id = $4",
        &version.name,
        &version.displayable_graph,
        &version.runnable_graph,
        &version.id,
    )
    .execute(pool)
    .await?;

    Ok(())
}
