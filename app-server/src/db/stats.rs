use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

pub async fn create_usage_stats_for_workspace(pool: &PgPool, workspace_id: &Uuid) -> Result<()> {
    sqlx::query("INSERT INTO workspace_usage (workspace_id) VALUES ($1);")
        .bind(workspace_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn add_spans_and_events_to_project_usage_stats(
    pool: &PgPool,
    project_id: &Uuid,
    spans: i64,
    events: i64,
) -> Result<()> {
    sqlx::query(
        "UPDATE workspace_usage
        SET span_count = span_count + $2,
            event_count = event_count + $3,
            span_count_since_reset = span_count_since_reset + $2,
            event_count_since_reset = event_count_since_reset + $3
        WHERE workspace_id = (
            SELECT workspace_id
            FROM projects
            WHERE id = $1
            LIMIT 1)",
    )
    .bind(project_id)
    .bind(spans)
    .bind(events)
    .execute(pool)
    .await?;

    Ok(())
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub storage_mib: Option<f64>,
}

pub async fn get_workspace_storage_stats(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<StorageStats> {
    let storage_stats = sqlx::query_as::<_, StorageStats>(
        "SELECT (sum(pg_column_size(data)) + sum(pg_column_size(target)))::float8 / 1024 / 1024 as storage_mib
        FROM dataset_datapoints 
        WHERE dataset_id in (
            SELECT id FROM datasets WHERE project_id in (
                SELECT id FROM projects where workspace_id = $1
            )
        )",
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;

    Ok(storage_stats)
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStats {
    pub tier_name: String,
    pub total_spans: i64,
    pub total_events: i64,
    pub spans_this_month: i64,
    pub events_this_month: i64,
    pub spans_limit: i64,
    pub events_limit: i64,
    pub spans_over_limit: i64,
    // TODO: fetch this from stripe meters once they are configured
    pub spans_over_limit_cost: f64,
    pub events_over_limit: i64,
    // TODO: fetch this from stripe meters once they are configured
    pub events_over_limit_cost: f64,

    pub members: i64,
    pub members_limit: i64,
    pub seats_included_in_tier: i64,
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
            workspace_usage.event_count as total_events,
            subscription_tiers.spans as spans_limit,
            GREATEST(
                workspace_usage.span_count_since_reset - subscription_tiers.spans, 
                0
            ) as spans_over_limit,
            subscription_tiers.events as events_limit,
            GREATEST(
                workspace_usage.event_count_since_reset - subscription_tiers.events, 
                0
            ) as events_over_limit,
            workspace_usage.span_count_since_reset as spans_this_month,
            workspace_usage.event_count_since_reset as events_this_month,
            GREATEST(
                workspace_usage.span_count_since_reset - subscription_tiers.spans,
                0
            )::float8 * subscription_tiers.extra_span_price as spans_over_limit_cost,
            GREATEST(
                workspace_usage.event_count_since_reset - subscription_tiers.events,
                0
            )::float8 * subscription_tiers.extra_event_price as events_over_limit_cost,

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

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWorkspacesCount {
    pub num_workspaces: i64,
    pub workspaces_limit: i64,
}
