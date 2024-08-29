use std::ops::DerefMut;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{prelude::FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::pipeline::Graph;

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
    let mut transaction: Transaction<Postgres> = pool.begin().await?;
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
    .fetch_one(transaction.deref_mut())
    .await?;

    let graph = match serde_json::from_value::<Graph>(runnable_graph.clone()) {
        Ok(graph) => graph,
        Err(e) => {
            transaction.rollback().await?;
            return Err(anyhow::anyhow!("could not parse graph: {}", e));
        }
    };
    save_graph_nodes(&mut transaction, graph, &pipeline_version.id).await?;

    transaction.commit().await?;

    Ok(pipeline_version)
}

pub async fn clone_pipeline_version(
    pool: &PgPool,
    ref_pipeline_version_id: Uuid,
    new_pipeline_version_name: &str,
    new_pipeline_version_type: &str,
) -> Result<Uuid> {
    let mut transaction: Transaction<Postgres> = pool.begin().await?;

    let pipeline_version = sqlx::query_as!(
        PipelineVersion,
        "INSERT INTO pipeline_versions (pipeline_id, pipeline_type, name, displayable_graph, runnable_graph) 
        SELECT pipeline_id, $1, $2, displayable_graph, runnable_graph FROM pipeline_versions WHERE id = $3
        RETURNING id, pipeline_id, pipeline_type, name, displayable_graph, runnable_graph, created_at",
        new_pipeline_version_type,
        new_pipeline_version_name,
        ref_pipeline_version_id,
    )
    .fetch_one(transaction.deref_mut())
    .await?;

    let graph = match serde_json::from_value::<Graph>(pipeline_version.runnable_graph.clone()) {
        Ok(graph) => graph,
        Err(e) => {
            transaction.rollback().await?;
            return Err(anyhow::anyhow!("could not parse graph: {}", e));
        }
    };
    save_graph_nodes(&mut transaction, graph, &pipeline_version.id).await?;

    transaction.commit().await?;

    Ok(pipeline_version.id)
}

pub async fn clone_pipeline_version_to_pipeline(
    pool: &PgPool,
    ref_pipeline_version_id: Uuid,
    pipeline_id: Uuid,
    new_pipeline_version_name: &str,
    new_pipeline_version_type: &str,
) -> Result<PipelineVersion> {
    let mut transaction: Transaction<Postgres> = pool.begin().await?;

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
    .fetch_one(transaction.deref_mut())
    .await?;

    let graph = match serde_json::from_value::<Graph>(pipeline_version.runnable_graph.clone()) {
        Ok(graph) => graph,
        Err(e) => {
            transaction.rollback().await?;
            return Err(anyhow::anyhow!("could not parse graph: {}", e));
        }
    };
    save_graph_nodes(&mut transaction, graph, &pipeline_version.id).await?;

    transaction.commit().await?;

    Ok(pipeline_version)
}

/// Overwrite pipeline version's graph without changing the pipeline name and type
pub async fn overwrite_graph(
    pool: &PgPool,
    ref_pipeline_version_id: Uuid,
    workshop_pipeline_version_id: Uuid,
) -> Result<()> {
    let mut transaction: Transaction<Postgres> = pool.begin().await?;

    // Need to query separately to use this in save_graph_nodes
    let ref_pipeline_version = sqlx::query_as!(
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
        ref_pipeline_version_id,
    )
    .fetch_one(pool)
    .await?;

    // TODO: Remove save_graph_nodes and do everything in one query using "WITH ref_version AS ..."
    sqlx::query!(
        "UPDATE pipeline_versions SET displayable_graph = $1, runnable_graph = $2 WHERE id = $3",
        &ref_pipeline_version.displayable_graph,
        &ref_pipeline_version.runnable_graph,
        workshop_pipeline_version_id,
    )
    .execute(transaction.deref_mut())
    .await?;

    let graph = match serde_json::from_value::<Graph>(ref_pipeline_version.runnable_graph.clone()) {
        Ok(graph) => graph,
        Err(e) => {
            return Err(anyhow::anyhow!("could not parse graph: {}", e));
        }
    };
    save_graph_nodes(&mut transaction, graph, &workshop_pipeline_version_id).await?;

    transaction.commit().await?;

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
) -> Result<PipelineVersion> {
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

/// Update a pipeline version in the database
///
/// Note: Use only for workshop pipeline versions.
pub async fn update_pipeline_version(pool: &PgPool, version: &PipelineVersion) -> Result<()> {
    let mut transaction: Transaction<Postgres> = pool.begin().await?;
    sqlx::query!(
        "UPDATE pipeline_versions SET name = $1, displayable_graph = $2, runnable_graph = $3 WHERE id = $4",
        &version.name,
        &version.displayable_graph,
        &version.runnable_graph,
        &version.id,
    )
    .execute(transaction.deref_mut())
    .await?;

    let graph = match serde_json::from_value::<Graph>(version.runnable_graph.clone()) {
        Ok(graph) => graph,
        Err(e) => {
            transaction.rollback().await?;
            return Err(anyhow::anyhow!("could not parse graph: {}", e));
        }
    };
    save_graph_nodes(&mut transaction, graph, &version.id).await?;

    transaction.commit().await?;

    Ok(())
}

async fn save_graph_nodes(
    transaction: &mut Transaction<'_, Postgres>,
    graph: Graph,
    pipeline_version_id: &Uuid,
) -> Result<()> {
    // TODO: should we also delete nodes that are not in the graph anymore?
    // pros: no bloating DB
    // cons: logs lost
    let mut ids = vec![];
    let mut types = vec![];
    let mut states = vec![];
    for node in graph.nodes.values() {
        ids.push(node.id());
        types.push(node.node_type());
        states.push(serde_json::json!(node));
    }
    // EXCLUDED is a special table name in postgres ON CONFLICT DO UPDATE
    // to capture the value of the conflicting row
    sqlx::query!(
        "
        WITH new_nodes(id, type, state) AS (
            SELECT id, type, state FROM
            UNNEST ($1::uuid[], $2::text[], $3::jsonb[]) as tmp_table(id, type, state)
        )
        INSERT INTO nodes (id, pipeline_version_id, type, state)
            SELECT id as new_id, $4 as pipeline_version_id, type, state FROM new_nodes
        ON CONFLICT (id, pipeline_version_id) DO UPDATE SET state = EXCLUDED.state",
        &ids,
        &types,
        &states,
        pipeline_version_id,
    )
    .execute(transaction.deref_mut())
    .await?;
    Ok(())
}
