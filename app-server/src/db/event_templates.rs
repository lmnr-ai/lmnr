use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::Type, Deserialize, Serialize, Debug, Clone, PartialEq)]
#[sqlx(type_name = "event_type")]
pub enum EventType {
    BOOLEAN,
    NUMBER,
    STRING,
}

/// Event type for a project
///
/// (name, project_id) is a unique constraint
#[derive(Serialize, sqlx::FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventTemplate {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
    pub event_type: EventType,
}

pub async fn get_event_templates_by_project_id(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<EventTemplate>> {
    let event_templates = sqlx::query_as::<_, EventTemplate>(
        "SELECT
            id,
            created_at,
            name,
            project_id,
            event_type
        FROM event_templates
        WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(event_templates)
}

/// Get event template by name and project_id
///
/// (project_id, name) is a unique constraint
pub async fn get_event_template_by_name(
    pool: &PgPool,
    name: &str,
    project_id: Uuid,
) -> Result<Option<EventTemplate>> {
    let event_template = sqlx::query_as::<_, EventTemplate>(
        "SELECT
            id,
            created_at,
            name,
            project_id,
            event_type
        FROM event_templates
        WHERE name = $1 AND project_id = $2",
    )
    .bind(name)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(event_template)
}

pub async fn get_event_template_by_id(pool: &PgPool, id: &Uuid) -> Result<EventTemplate> {
    let event_template = sqlx::query_as::<_, EventTemplate>(
        "SELECT
            id,
            created_at,
            name,
            project_id,
            event_type
        FROM event_templates
        WHERE id = $1
        ORDER BY created_at DESC
        LIMIT 1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(event_template)
}

/// Create event template without raising an error if it already exists
///
/// If users send event template creation request simultaneously, we need to ensure they all have the same event type.
pub async fn create_event_template_idempotent(
    pool: &PgPool,
    name: &str,
    project_id: Uuid,
    event_type: EventType,
) -> Result<EventTemplate> {
    // Do nothing on conflict, i.e. do not update event type
    sqlx::query(
        "INSERT INTO event_templates (name, project_id, event_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (name, project_id) DO NOTHING",
    )
    .bind(name)
    .bind(project_id)
    .bind(&event_type)
    .execute(pool)
    .await?;

    // https://stackoverflow.com/questions/34708509/how-to-use-returning-with-on-conflict-in-postgresql
    let event_template = get_event_template_by_name(pool, name, project_id).await?;
    let event_template = event_template.unwrap();

    if event_template.event_type != event_type {
        return Err(anyhow::anyhow!(
            "Event template already exists with different event type, current: {:?}, attempted: {:?}",
            event_template.event_type,
            event_type
        ));
    }

    Ok(event_template)
}

/// Updates event type
///
/// This must not be possible. If you want to change the event type, you must delete the event template and create a new one.
pub async fn update_event_template(
    pool: &PgPool,
    id: Uuid,
    project_id: Uuid,
    event_type: EventType,
) -> Result<EventTemplate> {
    let event_template = sqlx::query_as::<_, EventTemplate>(
        "UPDATE event_templates
        SET event_type = $3
        WHERE id = $1 AND project_id = $2
        RETURNING id, created_at, name, project_id, event_type",
    )
    .bind(id)
    .bind(project_id)
    .bind(event_type)
    .fetch_one(pool)
    .await?;

    Ok(event_template)
}

pub async fn delete_event_template(pool: &PgPool, id: &Uuid) -> Result<()> {
    sqlx::query("DELETE FROM event_templates WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn get_event_templates_map(
    pool: &PgPool,
    names: &Vec<String>,
    project_id: Uuid,
) -> Result<HashMap<String, EventTemplate>> {
    let records = sqlx::query_as::<_, EventTemplate>(
        "SELECT id, created_at, name, project_id, event_type FROM event_templates WHERE name = ANY($1) and project_id = $2",
    )
    .bind(names)
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    let mut res = HashMap::new();
    for record in records {
        res.insert(record.name.clone(), record);
    }

    Ok(res)
}
