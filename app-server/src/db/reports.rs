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

/// Fetch email addresses from report_targets for a given report where type = 'EMAIL'.
/// The workspace_id parameter is used as a safety check to ensure the report belongs
/// to the expected workspace.
pub async fn get_report_target_emails(
    pool: &PgPool,
    report_id: &Uuid,
    workspace_id: &Uuid,
) -> anyhow::Result<Vec<String>> {
    let emails = sqlx::query_scalar::<_, String>(
        "SELECT rt.email FROM report_targets rt
         JOIN reports r ON rt.report_id = r.id
         WHERE rt.report_id = $1 AND r.workspace_id = $2
           AND rt.type = 'EMAIL' AND rt.email IS NOT NULL",
    )
    .bind(report_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    Ok(emails)
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
