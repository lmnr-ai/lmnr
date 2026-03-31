use std::fmt::Display;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Debug, Clone, Serialize, Deserialize)]
pub struct UsageWarningDbRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub usage_item: String,
    pub limit_value: i64,
    pub last_notified_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UsageItem {
    Bytes,
    SignalRuns,
}

impl UsageItem {
    fn try_from_str(s: &str) -> anyhow::Result<Self> {
        match s.to_lowercase().trim() {
            "bytes" => Ok(Self::Bytes),
            "signal_runs" | "signalruns" => Ok(Self::SignalRuns),
            x => Err(anyhow::anyhow!("unknown usage item value {}", x)),
        }
    }
}

impl Display for UsageItem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Bytes => "bytes",
            Self::SignalRuns => "signal_runs",
        };
        f.write_str(s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageWarning {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub usage_item: UsageItem,
    pub limit_value: i64,
    pub last_notified_at: Option<DateTime<Utc>>,
}

impl TryInto<UsageWarning> for UsageWarningDbRow {
    type Error = anyhow::Error;

    fn try_into(self) -> Result<UsageWarning, Self::Error> {
        Ok(UsageWarning {
            id: self.id,
            workspace_id: self.workspace_id,
            usage_item: UsageItem::try_from_str(&self.usage_item)?,
            limit_value: self.limit_value,
            last_notified_at: self.last_notified_at,
        })
    }
}

/// Fetch all usage warnings for a workspace.
pub async fn get_usage_warnings_for_workspace(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<Vec<UsageWarning>> {
    let warnings = sqlx::query_as::<_, UsageWarningDbRow>(
        "SELECT id, workspace_id, usage_item, limit_value, last_notified_at
         FROM workspace_usage_warnings
         WHERE workspace_id = $1
         ORDER BY usage_item, limit_value ASC",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    let res = warnings
        .into_iter()
        .map(|w| w.try_into())
        .collect::<anyhow::Result<_, _>>()?;

    Ok(res)
}

/// Mark a usage warning as notified now. Called by the notification worker after
/// successfully delivering the notification.
pub async fn mark_warning_as_notified(pool: &PgPool, warning_id: Uuid) -> Result<()> {
    sqlx::query("UPDATE workspace_usage_warnings SET last_notified_at = NOW() WHERE id = $1")
        .bind(warning_id)
        .execute(pool)
        .await?;
    Ok(())
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
    let name = sqlx::query_scalar::<_, String>("SELECT name FROM workspaces WHERE id = $1")
        .bind(workspace_id)
        .fetch_one(pool)
        .await?;

    Ok(name)
}
