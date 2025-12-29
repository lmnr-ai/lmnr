use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, types::Json};
use uuid::Uuid;

use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RolloutSessionStatus {
    Pending,
    Running,
    Finished,
    Stopped,
}

impl RolloutSessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Running => "RUNNING",
            Self::Finished => "FINISHED",
            Self::Stopped => "STOPPED",
        }
    }
}

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RolloutSession {
    pub id: Uuid,
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub path_to_count: Json<HashMap<String, u32>>,
    pub params: Value,
    pub status: String,
    pub cursor_timestamp: DateTime<Utc>,
}

pub async fn get_rollout_session(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
) -> Result<Option<RolloutSession>> {
    let result = sqlx::query_as::<_, RolloutSession>(
        "SELECT
            id,
            project_id,
            trace_id,
            path_to_count,
            params,
            status,
            cursor_timestamp
        FROM
            rollout_playgrounds
        WHERE
            id = $1 AND project_id = $2",
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
) -> Result<()> {
    sqlx::query(
        "INSERT INTO rollout_playgrounds (id, project_id, trace_id, path_to_count, cursor_timestamp, params)
        VALUES ($1, $2, $3, '{}', now(), $4)
        ON CONFLICT (id) DO NOTHING",
    )
    .bind(session_id)
    .bind(project_id)
    .bind(Uuid::nil())
    .bind(params)
    .execute(pool)
    .await?;

    Ok(())
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

pub async fn update_session_status(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
    status: RolloutSessionStatus,
) -> Result<()> {
    sqlx::query(
        "UPDATE rollout_playgrounds
        SET status = $1
        WHERE id = $2 AND project_id = $3",
    )
    .bind(status.as_str())
    .bind(session_id)
    .bind(project_id)
    .execute(pool)
    .await?;

    Ok(())
}
