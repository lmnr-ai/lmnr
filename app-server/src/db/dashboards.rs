use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgConnection, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DashboardChart {
    pub id: Uuid,
    pub project_id: Uuid,
    pub dashboard_id: Uuid,
    pub name: String,
    pub query: String,
    /// `{config, layout, queryStructure}`; the frontend's `DashboardChart["settings"]`.
    pub settings: Value,
    pub created_at: DateTime<Utc>,
}

/// Same key as the frontend's `getOrCreateDefaultDashboard`, so creating the default dashboard
/// and deleting the last one serialize against each other.
pub async fn lock_project_dashboards(conn: &mut PgConnection, project_id: Uuid) -> Result<()> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("dashboards:{project_id}"))
        .execute(conn)
        .await?;
    Ok(())
}

pub async fn insert_dashboard(pool: &PgPool, project_id: Uuid, name: &str) -> Result<Dashboard> {
    let dashboard = sqlx::query_as::<_, Dashboard>(
        "INSERT INTO dashboards (project_id, name) VALUES ($1, $2)
         RETURNING id, project_id, name, created_at",
    )
    .bind(project_id)
    .bind(name)
    .fetch_one(pool)
    .await?;
    Ok(dashboard)
}

pub async fn rename_dashboard(
    pool: &PgPool,
    project_id: Uuid,
    dashboard_id: Uuid,
    name: &str,
) -> Result<Option<Dashboard>> {
    let dashboard = sqlx::query_as::<_, Dashboard>(
        "UPDATE dashboards SET name = $3 WHERE project_id = $1 AND id = $2
         RETURNING id, project_id, name, created_at",
    )
    .bind(project_id)
    .bind(dashboard_id)
    .bind(name)
    .fetch_optional(pool)
    .await?;
    Ok(dashboard)
}

pub async fn count_dashboards(conn: &mut PgConnection, project_id: Uuid) -> Result<i64> {
    let count =
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM dashboards WHERE project_id = $1")
            .bind(project_id)
            .fetch_one(conn)
            .await?;
    Ok(count)
}

/// Charts go with it via the `dashboard_id` ON DELETE CASCADE. Returns whether the row existed.
pub async fn delete_dashboard(
    conn: &mut PgConnection,
    project_id: Uuid,
    dashboard_id: Uuid,
) -> Result<bool> {
    let result = sqlx::query("DELETE FROM dashboards WHERE project_id = $1 AND id = $2")
        .bind(project_id)
        .bind(dashboard_id)
        .execute(conn)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Row-locks the dashboard so concurrent chart writes to it place charts one at a time.
pub async fn lock_dashboard(
    conn: &mut PgConnection,
    project_id: Uuid,
    dashboard_id: Uuid,
) -> Result<bool> {
    let found = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM dashboards WHERE project_id = $1 AND id = $2 FOR UPDATE",
    )
    .bind(project_id)
    .bind(dashboard_id)
    .fetch_optional(conn)
    .await?;
    Ok(found.is_some())
}

pub async fn get_charts(
    conn: &mut PgConnection,
    project_id: Uuid,
    dashboard_id: Uuid,
) -> Result<Vec<DashboardChart>> {
    let charts = sqlx::query_as::<_, DashboardChart>(
        "SELECT id, project_id, dashboard_id, name, query, settings, created_at
         FROM dashboard_charts WHERE project_id = $1 AND dashboard_id = $2",
    )
    .bind(project_id)
    .bind(dashboard_id)
    .fetch_all(conn)
    .await?;
    Ok(charts)
}

pub async fn insert_chart(
    conn: &mut PgConnection,
    project_id: Uuid,
    dashboard_id: Uuid,
    name: &str,
    query: &str,
    settings: &Value,
) -> Result<DashboardChart> {
    let chart = sqlx::query_as::<_, DashboardChart>(
        "INSERT INTO dashboard_charts (project_id, dashboard_id, name, query, settings)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, project_id, dashboard_id, name, query, settings, created_at",
    )
    .bind(project_id)
    .bind(dashboard_id)
    .bind(name)
    .bind(query)
    .bind(settings)
    .fetch_one(conn)
    .await?;
    Ok(chart)
}

pub async fn update_chart(
    conn: &mut PgConnection,
    project_id: Uuid,
    dashboard_id: Uuid,
    chart_id: Uuid,
    name: &str,
    query: &str,
    settings: &Value,
) -> Result<Option<DashboardChart>> {
    let chart = sqlx::query_as::<_, DashboardChart>(
        "UPDATE dashboard_charts SET name = $4, query = $5, settings = $6
         WHERE project_id = $1 AND dashboard_id = $2 AND id = $3
         RETURNING id, project_id, dashboard_id, name, query, settings, created_at",
    )
    .bind(project_id)
    .bind(dashboard_id)
    .bind(chart_id)
    .bind(name)
    .bind(query)
    .bind(settings)
    .fetch_optional(conn)
    .await?;
    Ok(chart)
}

pub async fn update_chart_layout(
    conn: &mut PgConnection,
    project_id: Uuid,
    dashboard_id: Uuid,
    chart_id: Uuid,
    layout: &Value,
) -> Result<()> {
    sqlx::query(
        "UPDATE dashboard_charts SET settings = jsonb_set(settings, '{layout}', $4)
         WHERE project_id = $1 AND dashboard_id = $2 AND id = $3",
    )
    .bind(project_id)
    .bind(dashboard_id)
    .bind(chart_id)
    .bind(layout)
    .execute(conn)
    .await?;
    Ok(())
}

/// Returns how many of `chart_ids` existed on the dashboard.
pub async fn delete_charts(
    pool: &PgPool,
    project_id: Uuid,
    dashboard_id: Uuid,
    chart_ids: &[Uuid],
) -> Result<u64> {
    let result = sqlx::query(
        "DELETE FROM dashboard_charts
         WHERE project_id = $1 AND dashboard_id = $2 AND id = ANY($3)",
    )
    .bind(project_id)
    .bind(dashboard_id)
    .bind(chart_ids)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}
