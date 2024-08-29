use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TagType {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
}

// (type_id, run_id) is a unique constraint
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceTag {
    pub id: Uuid,
    pub run_id: Uuid,
    pub value: Option<Value>,
    pub type_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceTagWithTypeName {
    pub id: Uuid,
    pub run_id: Uuid,
    pub value: Option<Value>,
    pub type_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub type_name: String,
}

pub async fn get_tag_types_by_project_id(pool: &PgPool, project_id: Uuid) -> Result<Vec<TagType>> {
    let tag_types = sqlx::query_as!(
        TagType,
        "SELECT id, created_at, name, project_id
        FROM tag_types
        WHERE project_id = $1",
        project_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(tag_types)
}

pub async fn create_tag_type(
    pool: &PgPool,
    id: Uuid,
    name: String,
    project_id: Uuid,
) -> Result<TagType> {
    let tag_type = sqlx::query_as!(
        TagType,
        "INSERT INTO tag_types (id, name, project_id)
        VALUES ($1, $2, $3)
        RETURNING id, created_at, name, project_id",
        id,
        name,
        project_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(tag_type)
}

pub async fn update_trace_tag(
    pool: &PgPool,
    run_id: Uuid,
    value: Value,
    type_id: Uuid,
) -> Result<TraceTag> {
    // Create or update trace tag where run_id and type_id match
    let trace_tag = sqlx::query_as!(
        TraceTag,
        "INSERT INTO trace_tags (run_id, value, type_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (run_id, type_id)
        DO UPDATE SET value = $2
        RETURNING id, run_id, value, type_id, created_at",
        run_id,
        value,
        type_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(trace_tag)
}

pub async fn get_trace_tags(pool: &PgPool, run_id: Uuid) -> Result<Vec<TraceTagWithTypeName>> {
    let trace_tags = sqlx::query_as!(
        TraceTagWithTypeName,
        "SELECT trace_tags.id, trace_tags.run_id, trace_tags.value, trace_tags.type_id, trace_tags.created_at, tag_types.name as type_name
        FROM trace_tags
        JOIN tag_types ON trace_tags.type_id = tag_types.id
        WHERE run_id = $1
        ORDER BY trace_tags.created_at DESC",
        run_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(trace_tags)
}
