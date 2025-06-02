use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize, FromRow)]
pub struct WorkspaceLimitsExceeded {
    pub steps: bool,
    pub bytes_ingested: bool,
}

pub async fn create_usage_stats_for_workspace(pool: &PgPool, workspace_id: &Uuid) -> Result<()> {
    sqlx::query("INSERT INTO workspace_usage (workspace_id) VALUES ($1);")
        .bind(workspace_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn add_spans_to_project_usage_stats(
    pool: &PgPool,
    project_id: &Uuid,
    spans: i64,
) -> Result<()> {
    sqlx::query(
        "UPDATE workspace_usage
        SET span_count = span_count + $2,
            span_count_since_reset = span_count_since_reset + $2
        WHERE workspace_id = (
            SELECT workspace_id
            FROM projects
            WHERE id = $1
            LIMIT 1)",
    )
    .bind(project_id)
    .bind(spans)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn increment_project_spans_bytes_ingested(
    pool: &PgPool,
    project_id: &Uuid,
    spans_bytes: usize,
) -> Result<()> {
    sqlx::query(
        "UPDATE workspace_usage
        SET spans_bytes_ingested = spans_bytes_ingested + $2,
            spans_bytes_ingested_since_reset = spans_bytes_ingested_since_reset + $2
        WHERE workspace_id = (
            SELECT workspace_id
            FROM projects
            WHERE id = $1
            LIMIT 1)",
    )
    .bind(project_id)
    .bind(spans_bytes as i64)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn increment_project_browser_events_bytes_ingested(
    pool: &PgPool,
    project_id: &Uuid,
    browser_events_bytes: usize,
) -> Result<()> {
    sqlx::query(
        "UPDATE workspace_usage
        SET browser_session_events_bytes_ingested = browser_session_events_bytes_ingested + $2,
            browser_session_events_bytes_ingested_since_reset = browser_session_events_bytes_ingested_since_reset + $2
        WHERE workspace_id = (
            SELECT workspace_id
            FROM projects
            WHERE id = $1
            LIMIT 1)",
    )
    .bind(project_id)
    .bind(browser_events_bytes as i64)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn add_agent_steps_to_project_usage_stats(
    pool: &PgPool,
    project_id: &Uuid,
    steps: i64,
) -> Result<()> {
    sqlx::query(
        "UPDATE workspace_usage
        SET step_count = step_count + $2,
            step_count_since_reset = step_count_since_reset + $2
        WHERE workspace_id = (
            SELECT workspace_id
            FROM projects
            WHERE id = $1
            LIMIT 1)",
    )
    .bind(project_id)
    .bind(steps)
    .execute(pool)
    .await?;

    Ok(())
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub storage_mib: Option<f64>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStats {
    pub tier_name: String,
    pub seats_included_in_tier: i64,
    pub total_spans: i64,
    pub spans_this_month: i64,
    pub total_steps: i64,
    pub steps_this_month: i64,
    pub spans_limit: i64,
    pub steps_limit: i64,
    pub spans_over_limit: i64,
    pub steps_over_limit: i64,
    // TODO: fetch this from stripe meters once they are configured
    pub spans_over_limit_cost: f64,
    pub steps_over_limit_cost: f64,

    pub members: i64,
    pub members_limit: i64,
    pub reset_time: DateTime<Utc>,
    pub storage_limit: i64,
}

pub async fn get_workspace_stats(pool: &PgPool, workspace_id: &Uuid) -> Result<WorkspaceStats> {
    let workspace_stats = sqlx::query_as::<_, WorkspaceStats>(
        "WITH members_per_workspace AS (
            SELECT
                workspace_id,
                count(user_id)::int8 as members
            FROM
                members_of_workspaces
            WHERE
                workspace_id = $1
            GROUP BY workspace_id
        )
        SELECT
            subscription_tiers.name as tier_name,
            subscription_tiers.members_per_workspace as seats_included_in_tier,
            workspace_usage.span_count as total_spans,
            workspace_usage.span_count_since_reset as spans_this_month,
            workspace_usage.step_count as total_steps,
            workspace_usage.step_count_since_reset as steps_this_month,
            subscription_tiers.spans as spans_limit,
            subscription_tiers.steps as steps_limit,
            GREATEST(
                workspace_usage.span_count_since_reset - subscription_tiers.spans, 
                0
            ) as spans_over_limit,
            GREATEST(
                workspace_usage.span_count_since_reset - subscription_tiers.spans,
                0
            )::float8 * subscription_tiers.extra_span_price as spans_over_limit_cost,
            GREATEST(
                workspace_usage.step_count_since_reset - subscription_tiers.steps,
                0
            ) as steps_over_limit,
            GREATEST(
                workspace_usage.step_count_since_reset - subscription_tiers.steps,
                0
            )::float8 * subscription_tiers.extra_step_price as steps_over_limit_cost,
            members_per_workspace.members,
            subscription_tiers.members_per_workspace +
                workspaces.additional_seats as members_limit,
            subscription_tiers.storage_mib as storage_limit,
            workspace_usage.reset_time
        FROM
            workspace_usage
            JOIN members_per_workspace
                ON members_per_workspace.workspace_id = workspace_usage.workspace_id
            JOIN workspaces ON workspaces.id = workspace_usage.workspace_id
            JOIN subscription_tiers ON subscription_tiers.id = workspaces.tier_id",
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;

    Ok(workspace_stats)
}

pub async fn is_workspace_over_limit(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> Result<WorkspaceLimitsExceeded> {
    let limits_exceeded = sqlx::query_as::<_, WorkspaceLimitsExceeded>(
        "WITH workspace_stats AS (
            SELECT
                subscription_tiers.name as tier_name,
                subscription_tiers.steps as steps_limit,
                subscription_tiers.bytes_ingested as ingested_bytes_limit,
                workspace_usage.step_count_since_reset as steps_this_month,
                workspace_usage.spans_bytes_ingested_since_reset as spans_bytes_this_month,
                workspace_usage.browser_session_events_bytes_ingested_since_reset as browser_events_bytes_this_month
            FROM
                workspaces
            JOIN subscription_tiers ON subscription_tiers.id = workspaces.tier_id
            JOIN workspace_usage ON workspace_usage.workspace_id = workspaces.id
            WHERE
                workspace_id = $1
        )
        SELECT
            steps_this_month >= steps_limit AND LOWER(TRIM(tier_name)) = 'free' as steps,
            spans_bytes_this_month + browser_events_bytes_this_month >= ingested_bytes_limit
                AND LOWER(TRIM(tier_name)) = 'free' as bytes_ingested
        FROM
            workspace_stats",
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;

    Ok(limits_exceeded)
}
