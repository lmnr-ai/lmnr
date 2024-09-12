use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

/// Combination of subscription tier and user-specific limits
#[derive(Debug, FromRow, Clone)]
pub struct SubscriptionLimits {
    pub members_per_workspace: i64,
    pub num_workspaces: i64,

    // User-specific limits
    pub additional_seats: Option<i64>,
}

pub async fn get_limits_for_user(
    pool: &PgPool,
    user_id: &Uuid,
) -> anyhow::Result<SubscriptionLimits> {
    let tier = sqlx::query_as::<_, SubscriptionLimits>(
        "SELECT
            subscription_tiers.members_per_workspace,
            subscription_tiers.num_workspaces,
            user_limits.additional_seats
        FROM
            users
        JOIN subscription_tiers ON subscription_tiers.id = users.tier_id
        LEFT JOIN user_limits ON user_limits.user_id = users.id
        WHERE users.id = $1",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(tier.into())
}

pub async fn get_limits_for_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<SubscriptionLimits> {
    let tier = sqlx::query_as::<_, SubscriptionLimits>(
        "SELECT
            subscription_tiers.members_per_workspace,
            subscription_tiers.num_workspaces,
            user_limits.additional_seats
        FROM
            users
        JOIN subscription_tiers ON subscription_tiers.id = users.tier_id
        LEFT JOIN user_limits ON user_limits.user_id = users.id
        WHERE users.id = (
            SELECT
                user_id
            FROM
                members_of_workspaces
            WHERE
                workspace_id = $1
                AND member_role = 'owner'::workspace_role
            LIMIT 1
        )",
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;

    Ok(tier.into())
}

#[derive(Debug, FromRow, Clone)]
pub struct WorkspaceProjectStats {
    pub current_projects: i64,
    pub project_limit: i64,
}

pub async fn get_workspace_project_count_and_limit(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<WorkspaceProjectStats> {
    let project_count = sqlx::query_as::<_, WorkspaceProjectStats>(
        "SELECT
            (SELECT count(*) FROM projects WHERE workspace_id = $1) as current_projects,
            subscription_tiers.projects_per_workspace as project_limit
        FROM
            users
        JOIN subscription_tiers ON subscription_tiers.id = users.tier_id
        JOIN members_of_workspaces ON members_of_workspaces.user_id = users.id
        WHERE
            workspace_id = $1
            AND member_role = 'owner'::workspace_role",
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;

    Ok(project_count.into())
}
