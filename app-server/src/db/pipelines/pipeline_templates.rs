use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineTemplateRow {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub runnable_graph: Value,
    pub displayable_graph: Value,
    pub number_of_nodes: i64,
    pub description: String,
    pub display_group: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineTemplateInfo {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub description: String,
    pub display_group: String,
}

pub async fn get_template(pool: &PgPool, id: &Uuid) -> Result<PipelineTemplateRow> {
    let template = sqlx::query_as!(
        PipelineTemplateRow,
        "
        SELECT id, created_at, name, runnable_graph, displayable_graph, number_of_nodes, description, display_group
        FROM pipeline_templates
        WHERE id = $1
        ",
        id,
    )
    .fetch_one(pool)
    .await?;

    Ok(template)
}

pub async fn write_template(
    pool: &PgPool,
    name: &String,
    description: &String,
    runnable_graph_template: &Value,
    displayable_graph_template: &Value,
    number_of_nodes: i64,
    group: &String,
) -> Result<PipelineTemplateRow> {
    let template = sqlx::query_as!(
        PipelineTemplateRow,
        "
        INSERT INTO pipeline_templates
        (name, description, runnable_graph, displayable_graph, number_of_nodes, display_group)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, name, description, runnable_graph, displayable_graph, number_of_nodes, display_group
        ",
        name,
        description,
        runnable_graph_template,
        displayable_graph_template,
        number_of_nodes,
        group,
    )
    .fetch_one(pool)
    .await?;

    Ok(template)
}

pub async fn get_all_templates(pool: &PgPool) -> Result<Vec<PipelineTemplateInfo>> {
    let templates = sqlx::query_as!(
        PipelineTemplateInfo,
        "SELECT id, created_at, name, description, display_group
        FROM pipeline_templates
        ORDER BY display_group ASC, ordinal ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(templates)
}
