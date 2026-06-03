use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RolloutSession {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub project_id: Uuid,
    pub name: Option<String>,
}

/// Idempotent upsert keyed on the SDK-supplied `session_id`. A null `name`
/// never clobbers a name already set (e.g. via the frontend).
pub async fn create_or_update_rollout_session(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
    name: Option<String>,
) -> Result<RolloutSession> {
    let session = sqlx::query_as::<_, RolloutSession>(
        // The conflict update is scoped to the owning project so a caller
        // supplying another project's session id can't overwrite its name; the
        // mismatch yields no row and the query errors instead.
        "INSERT INTO rollout_sessions (id, project_id, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE
            SET name = COALESCE(EXCLUDED.name, rollout_sessions.name)
            WHERE rollout_sessions.project_id = $2
        RETURNING id, created_at, project_id, name",
    )
    .bind(session_id)
    .bind(project_id)
    .bind(name)
    .fetch_one(pool)
    .await?;

    Ok(session)
}

pub async fn delete_rollout_session(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
) -> Result<()> {
    sqlx::query(
        "DELETE FROM rollout_sessions
        WHERE id = $1 AND project_id = $2",
    )
    .bind(session_id)
    .bind(project_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Rename an existing session. Update-only (no upsert): returns `false` when no
/// row matches `(id, project_id)` so the caller can 404 instead of silently
/// creating a ghost session for a mistyped id.
pub async fn update_rollout_session_name(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
    name: &str,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE rollout_sessions
        SET name = $1
        WHERE id = $2 AND project_id = $3",
    )
    .bind(name)
    .bind(session_id)
    .bind(project_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

