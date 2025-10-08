use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

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
