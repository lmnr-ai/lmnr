use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWithWorkspaceBillingInfoDbRow {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
    pub tier_name: String,
    pub reset_time: DateTime<Utc>,
    pub workspace_project_ids: Vec<Uuid>,
    pub bytes_limit: i64,
    pub signal_steps_limit: i64,
    /// Custom hard limit for bytes, configured by the user. Overrides tier limit when set.
    #[serde(default)]
    pub custom_bytes_limit: Option<i64>,
    /// Custom hard limit for signal runs, configured by the user. Overrides tier limit when set.
    #[serde(default)]
    pub custom_signal_steps_limit: Option<i64>,
}

#[derive(Deserialize, Serialize, Default, PartialEq, Eq, Clone)]
pub enum WorkspaceTierName {
    Free,
    Pro,
    Hobby,
    #[default]
    Other,
}

impl WorkspaceTierName {
    fn from_str(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "free" => Self::Free,
            "hobby" => Self::Hobby,
            "pro" => Self::Pro,
            x => {
                log::warn!("Unknown workspace tier name: {}", x);
                Self::Other
            }
        }
    }

    pub fn is_free(&self) -> bool {
        *self == WorkspaceTierName::Free
    }
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWithWorkspaceBillingInfo {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
    pub tier_name: WorkspaceTierName,
    pub reset_time: DateTime<Utc>,
    pub workspace_project_ids: Vec<Uuid>,
    pub bytes_limit: i64,
    pub signal_steps_limit: i64,
    /// Custom hard limit for bytes, configured by the user. Overrides tier limit when set.
    #[serde(default)]
    pub custom_bytes_limit: Option<i64>,
    /// Custom hard limit for signal runs, configured by the user. Overrides tier limit when set.
    #[serde(default)]
    pub custom_signal_steps_limit: Option<i64>,
}

impl Into<ProjectWithWorkspaceBillingInfo> for ProjectWithWorkspaceBillingInfoDbRow {
    fn into(self) -> ProjectWithWorkspaceBillingInfo {
        ProjectWithWorkspaceBillingInfo {
            id: self.id,
            name: self.name,
            workspace_id: self.workspace_id,
            tier_name: WorkspaceTierName::from_str(&self.tier_name),
            reset_time: self.reset_time,
            workspace_project_ids: self.workspace_project_ids,
            bytes_limit: self.bytes_limit,
            signal_steps_limit: self.signal_steps_limit,
            custom_bytes_limit: self.custom_bytes_limit,
            custom_signal_steps_limit: self.custom_signal_steps_limit,
        }
    }
}

#[derive(FromRow, Debug, Clone)]
pub struct ProjectInfo {
    pub id: Uuid,
    pub name: String,
}

pub async fn get_projects_for_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<Vec<ProjectInfo>> {
    let projects =
        sqlx::query_as::<_, ProjectInfo>("SELECT id, name FROM projects WHERE workspace_id = $1")
            .bind(workspace_id)
            .fetch_all(pool)
            .await?;

    Ok(projects)
}

pub async fn get_project_and_workspace_billing_info(
    pool: &PgPool,
    project_id: &Uuid,
) -> Result<Option<ProjectWithWorkspaceBillingInfo>> {
    let result = sqlx::query_as::<_, ProjectWithWorkspaceBillingInfoDbRow>(
        "
        WITH workspace_project_ids AS (
            SELECT array_agg(id) as project_ids,
                workspace_id
            FROM projects
            GROUP BY workspace_id
        )
        SELECT
            projects.id,
            projects.name,
            projects.workspace_id,
            subscription_tiers.name as tier_name,
            workspaces.reset_time,
            COALESCE(workspace_project_ids.project_ids, '{}') as workspace_project_ids,
            subscription_tiers.bytes_ingested as bytes_limit,
            subscription_tiers.signal_steps_processed as signal_steps_limit,
            wul_bytes.limit_value as custom_bytes_limit,
            wul_signal_steps.limit_value as custom_signal_steps_limit
        FROM
            projects
            join workspaces on projects.workspace_id = workspaces.id
            join subscription_tiers on workspaces.tier_id = subscription_tiers.id
            LEFT join workspace_project_ids on projects.workspace_id = workspace_project_ids.workspace_id
            LEFT join workspace_usage_limits wul_bytes
                on wul_bytes.workspace_id = workspaces.id AND wul_bytes.limit_type = 'bytes'
            LEFT join workspace_usage_limits wul_signal_steps
                on wul_signal_steps.workspace_id = workspaces.id AND wul_signal_steps.limit_type = 'signal_steps_processed'
        WHERE
            projects.id = $1",
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(result.map(|r| r.into()))
}
