use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "deployment_mode")]
pub enum DeploymentMode {
    #[default]
    CLOUD,
    HYBRID,
    #[allow(non_camel_case_types)]
    SELF_HOST,
}

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWithWorkspaceBillingInfo {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
    pub tier_name: String,
    pub reset_time: DateTime<Utc>,
    pub workspace_project_ids: Vec<Uuid>,
    pub bytes_limit: i64,
}

pub async fn get_project_and_workspace_billing_info(
    pool: &PgPool,
    project_id: &Uuid,
) -> Result<ProjectWithWorkspaceBillingInfo> {
    let result = sqlx::query_as::<_, ProjectWithWorkspaceBillingInfo>(
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
            subscription_tiers.bytes_ingested as bytes_limit
        FROM
            projects
            join workspaces on projects.workspace_id = workspaces.id
            join subscription_tiers on workspaces.tier_id = subscription_tiers.id
            LEFT join workspace_project_ids on projects.workspace_id = workspace_project_ids.workspace_id
        WHERE
            projects.id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(result)
}

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub tier_id: i64,
    pub subscription_id: Option<String>,
    pub additional_seats: i64,
    pub reset_time: DateTime<Utc>,
    pub deployment_mode: DeploymentMode,
    pub data_plane_url: Option<String>,
}

pub async fn get_workspace_by_project_id(pool: &PgPool, project_id: &Uuid) -> Result<Workspace> {
    let result = sqlx::query_as::<_, Workspace>(
        "
        SELECT
            workspaces.id,
            workspaces.created_at,
            workspaces.name,
            workspaces.tier_id,
            workspaces.subscription_id,
            workspaces.additional_seats,
            workspaces.reset_time,
            workspaces.deployment_mode,
            workspaces.data_plane_url
        FROM
            workspaces
            JOIN projects ON projects.workspace_id = workspaces.id
        WHERE
            projects.id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(result)
}
