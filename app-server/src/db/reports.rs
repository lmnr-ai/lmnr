use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Debug, Clone)]
pub struct Report {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub r#type: String,
    pub weekdays: Vec<i32>,
    pub hour: i32,
    #[allow(unused)]
    pub created_at: DateTime<Utc>,
}

pub async fn get_reports_for_weekday_and_hour(
    pool: &PgPool,
    weekday: i32,
    hour: i32,
) -> anyhow::Result<Vec<Report>> {
    let reports = sqlx::query_as::<_, Report>(
        "SELECT id, workspace_id, type, weekdays, hour, created_at
         FROM reports
         WHERE hour = $1 AND $2 = ANY(weekdays)",
    )
    .bind(hour)
    .bind(weekday)
    .fetch_all(pool)
    .await?;

    Ok(reports)
}

#[derive(FromRow, Debug, Clone)]
pub struct ReportTarget {
    pub id: Uuid,
    pub r#type: String,
    pub email: Option<String>,
    pub channel_id: Option<String>,
    pub integration_id: Option<Uuid>,
}

/// Fetch all report targets (EMAIL and SLACK) for a given report in a single query.
pub async fn get_report_targets(
    pool: &PgPool,
    report_id: &Uuid,
    workspace_id: &Uuid,
) -> anyhow::Result<Vec<ReportTarget>> {
    let targets = sqlx::query_as::<_, ReportTarget>(
        "SELECT rt.id, rt.type, rt.email, rt.channel_id, rt.integration_id
         FROM report_targets rt
         JOIN reports r ON rt.report_id = r.id
         WHERE rt.report_id = $1 AND r.workspace_id = $2",
    )
    .bind(report_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    Ok(targets)
}

#[derive(FromRow, Debug, Clone)]
pub struct SignalInfo {
    pub id: Uuid,
    pub name: String,
    pub project_id: Uuid,
}

/// Fetch all signals for all projects in a workspace in a single query.
pub async fn get_signals_for_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<Vec<SignalInfo>> {
    let signals = sqlx::query_as::<_, SignalInfo>(
        "SELECT s.id, s.name, s.project_id
         FROM signals s
         JOIN projects p ON s.project_id = p.id
         WHERE p.workspace_id = $1",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    Ok(signals)
}
