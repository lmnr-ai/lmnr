use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

/// Combination of subscription tier and user-specific limits
#[derive(Debug, FromRow, Clone)]
pub struct SubscriptionLimits {
    pub _name: String,
    pub pipeline_runs_per_month: i64,
    pub _storage_mib: i64,
    pub _log_retention_days: i64,
    pub members_per_workspace: i64,
    pub num_workspaces: i64,
    pub pipeline_pulls_per_month: i64,

    // User-specific limits
    pub additional_seats: Option<i64>,
    pub code_services: Option<i64>,
}

pub async fn get_limits_for_user(
    pool: &PgPool,
    user_id: &Uuid,
) -> anyhow::Result<SubscriptionLimits> {
    #[allow(non_snake_case)]
    let tier = sqlx::query_as!(
        SubscriptionLimits,
        r#"SELECT
            subscription_tiers.name as _name,
            subscription_tiers.pipeline_runs_per_month,
            subscription_tiers.storage_mib as _storage_mib,
            subscription_tiers.log_retention_days as _log_retention_days,
            subscription_tiers.members_per_workspace,
            subscription_tiers.num_workspaces,
            subscription_tiers.pipeline_pulls_per_month,
            user_limits.additional_seats as "additional_seats?",
            user_limits.code_services as "code_services?"
        FROM
            users
        JOIN subscription_tiers ON subscription_tiers.id = users.tier_id
        LEFT JOIN user_limits ON user_limits.user_id = users.id
        WHERE users.id = $1"#,
        user_id
    )
    .fetch_one(pool)
    .await?;

    Ok(tier.into())
}

pub async fn get_limits_for_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<SubscriptionLimits> {
    #[allow(non_snake_case)]
    let tier = sqlx::query_as!(
        SubscriptionLimits,
        r#"SELECT
            subscription_tiers.name as _name,
            subscription_tiers.pipeline_runs_per_month,
            subscription_tiers.storage_mib as _storage_mib,
            subscription_tiers.log_retention_days as _log_retention_days,
            subscription_tiers.members_per_workspace,
            subscription_tiers.num_workspaces,
            subscription_tiers.pipeline_pulls_per_month,
            user_limits.additional_seats as "additional_seats?",
            user_limits.code_services as "code_services?"
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
        )"#,
        workspace_id
    )
    .fetch_one(pool)
    .await?;

    Ok(tier.into())
}

#[derive(Debug, FromRow, Clone)]
pub struct RunCount {
    pub _workspace_id: Uuid,
    pub _total_count: i64,
    pub count_since_reset: i64,
    pub _reset_time: DateTime<Utc>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub storage_mib: Option<f64>,
}

pub async fn get_user_storage_stats(pool: &PgPool, user_id: &Uuid) -> anyhow::Result<StorageStats> {
    let storage_stats = sqlx::query_as!(
        StorageStats,
        "SELECT (sum(pg_column_size(data)) + sum(pg_column_size(target)))::float8 / 1024 / 1024 as storage_mib
        FROM dataset_datapoints 
        WHERE dataset_id in (
            SELECT id FROM datasets WHERE project_id in (
                SELECT id FROM projects where workspace_id in (
                    SELECT workspace_id
                    FROM members_of_workspaces
                    WHERE user_id = $1
                    AND member_role = 'owner'::workspace_role
                )
            )
        )",
        user_id
    )
    .fetch_one(pool)
    .await?;

    Ok(storage_stats)
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserStats {
    pub plan_name: String,
    pub total_runs: Option<i64>,
    pub runs_this_month: Option<i64>,
    pub runs_limit_per_workspace: i64,
    pub codegens_limit_per_workspace: i64,
    pub runs_limit: Option<i64>,
    pub runs_next_reset_time: Option<DateTime<Utc>>,

    // storage is an expensive query, so fetched separately
    pub storage_mib_limit_per_workspace: i64,
    pub storage_mib_limit: Option<i64>,
    pub log_retention_days: i64,
    pub members_per_workspace: i64,
    pub num_workspaces: Option<i64>,

    pub workspaces_limit: i64,
    pub additional_seats: Option<i64>,
    pub code_services: Option<i64>,
}

pub async fn get_user_stats(pool: &PgPool, user_id: &Uuid) -> anyhow::Result<UserStats> {
    let stats = sqlx::query_as!(
        UserStats,
        r#"WITH owned_workspace_run_counts(user_id, total_runs, runs_this_month, runs_next_reset_time) AS (
            SELECT members_of_workspaces.user_id,
            sum(run_count.total_count)::int8,
            sum(run_count.count_since_reset)::int8,
            min(run_count.reset_time) + interval '1 month'
            FROM members_of_workspaces
            JOIN run_count on run_count.workspace_id = members_of_workspaces.workspace_id
            WHERE member_role = 'owner'::workspace_role
            GROUP by members_of_workspaces.user_id
        ),
        owned_workspaces(user_id, num_workspaces) AS (
            SELECT user_id, count(workspace_id)::int8 from members_of_workspaces
            WHERE member_role = 'owner'::workspace_role
            GROUP BY user_id
        )
        SELECT
            subscription_tiers.name as plan_name,
            owned_workspace_run_counts.total_runs,
            owned_workspace_run_counts.runs_this_month,
            subscription_tiers.pipeline_runs_per_month as runs_limit_per_workspace,
            subscription_tiers.pipeline_pulls_per_month as codegens_limit_per_workspace,
            subscription_tiers.pipeline_runs_per_month * owned_workspaces.num_workspaces as runs_limit,
            owned_workspace_run_counts.runs_next_reset_time,
            
            subscription_tiers.storage_mib as storage_mib_limit_per_workspace,
            subscription_tiers.storage_mib * owned_workspaces.num_workspaces as storage_mib_limit,
            subscription_tiers.log_retention_days,
            subscription_tiers.members_per_workspace,
            owned_workspaces.num_workspaces,

            subscription_tiers.num_workspaces as workspaces_limit,
            user_limits.additional_seats as "additional_seats?",
            user_limits.code_services as "code_services?"
        FROM
            users
        JOIN subscription_tiers ON subscription_tiers.id = users.tier_id
        JOIN owned_workspaces ON users.id = owned_workspaces.user_id
        JOIN owned_workspace_run_counts ON users.id = owned_workspace_run_counts.user_id
        LEFT JOIN user_limits ON user_limits.user_id = users.id
        WHERE users.id =  $1
        "#,
        user_id
    )
    .fetch_one(pool)
    .await?;

    Ok(stats)
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStats {
    pub total_runs: i64,
    pub runs_this_month: i64,
    pub runs_next_reset_time: Option<DateTime<Utc>>,

    pub total_codegens: i64,
    pub codegens_this_month: i64,

    pub members_count: Option<i64>,
    pub projects_count: Option<i64>,
}

pub async fn get_workspace_stats(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<WorkspaceStats> {
    let stats = sqlx::query_as!(
        WorkspaceStats,
        "WITH members_per_workspace(workspace_id, members_count) AS (
            SELECT workspace_id, count(user_id)::int8 from members_of_workspaces
            GROUP BY workspace_id
        ), projects_per_workspace(workspace_id, projects_count) AS (
            SELECT workspace_id, count(id)::int8 from projects
            GROUP BY workspace_id
        )
        SELECT
            run_count.total_count as total_runs,
            run_count.count_since_reset as runs_this_month,
            run_count.codegen_total_count as total_codegens,
            run_count.codegen_count_since_reset as codegens_this_month,
            run_count.reset_time + interval '1 month' as runs_next_reset_time,
            members_per_workspace.members_count,
            COALESCE(projects_per_workspace.projects_count, 0) as projects_count
        FROM
            run_count
        JOIN members_per_workspace ON run_count.workspace_id = members_per_workspace.workspace_id
        LEFT JOIN projects_per_workspace ON run_count.workspace_id = projects_per_workspace.workspace_id
        WHERE run_count.workspace_id = $1
        ",
        workspace_id
    )
    .fetch_one(pool)
    .await?;

    Ok(stats)
}
