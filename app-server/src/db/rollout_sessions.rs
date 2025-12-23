use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, types::Json};
use uuid::Uuid;

use std::collections::HashMap;

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RolloutSession {
    pub id: Uuid,
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub path_to_count: Json<HashMap<String, u32>>,
    pub params: Value,
    pub cursor_timestamp: DateTime<Utc>,
}

pub async fn get_rollout_session(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
) -> Result<Option<RolloutSession>> {
    let result = sqlx::query_as::<_, RolloutSession>(
        "SELECT
            rollout_playgrounds.id,
            rollout_playgrounds.project_id,
            rollout_playgrounds.trace_id,
            rollout_playgrounds.path_to_count,
            rollout_playgrounds.params,
            rollout_playgrounds.cursor_timestamp
        FROM
            rollout_playgrounds
        WHERE
            rollout_playgrounds.id = $1
            and rollout_playgrounds.project_id = $2",
    )
    .bind(session_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(result)
}

pub async fn create_rollout_session(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
    params: Value,
) -> Result<Uuid> {
    let session_id = sqlx::query_scalar(
        "INSERT INTO rollout_playgrounds (id, project_id, trace_id, path_to_count, cursor_timestamp, params)
        VALUES ($1, $2, $3, '{}', now(), $4)
        RETURNING id",
    )
    .bind(session_id)
    .bind(project_id)
    .bind(Uuid::nil())
    .bind(params)
    .fetch_one(pool)
    .await?;

    Ok(session_id)
}

pub async fn delete_rollout_session(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
) -> Result<()> {
    sqlx::query(
        "DELETE FROM rollout_playgrounds
        WHERE id = $1 AND project_id = $2",
    )
    .bind(session_id)
    .bind(project_id)
    .execute(pool)
    .await?;

    Ok(())
}
