use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Debug, Clone, Serialize, Deserialize)]
pub struct UsageWarning {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub usage_item: String,
    pub limit_value: i64,
    pub last_notified_at: Option<DateTime<Utc>>,
}

/// Fetch all usage warnings for a workspace.
pub async fn get_usage_warnings_for_workspace(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<Vec<UsageWarning>> {
    let warnings = sqlx::query_as::<_, UsageWarning>(
        "SELECT id, workspace_id, usage_item, limit_value, last_notified_at
         FROM workspace_usage_warnings
         WHERE workspace_id = $1
         ORDER BY usage_item, limit_value ASC",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    Ok(warnings)
}

/// Atomically mark a usage warning as notified for the current billing cycle.
/// Only updates if the warning has not already been notified since `billing_start`.
/// Returns true if this call was the one that marked it (i.e., we should send the notification).
pub async fn try_mark_warning_as_notified(
    pool: &PgPool,
    warning_id: Uuid,
    billing_start: DateTime<Utc>,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE workspace_usage_warnings
         SET last_notified_at = NOW()
         WHERE id = $1
           AND (last_notified_at IS NULL OR last_notified_at < $2)",
    )
    .bind(warning_id)
    .bind(billing_start)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// Get owner email(s) for a workspace.
pub async fn get_workspace_owner_emails(pool: &PgPool, workspace_id: Uuid) -> Result<Vec<String>> {
    let rows = sqlx::query_scalar::<_, String>(
        "SELECT u.email FROM users u
         JOIN members_of_workspaces mow ON u.id = mow.user_id
         WHERE mow.workspace_id = $1 AND mow.member_role = 'owner'",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Get workspace name by ID.
pub async fn get_workspace_name(pool: &PgPool, workspace_id: Uuid) -> Result<String> {
    let name = sqlx::query_scalar::<_, String>(
        "SELECT name FROM workspaces WHERE id = $1",
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;

    Ok(name)
}
