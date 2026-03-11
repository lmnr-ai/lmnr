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

#[derive(FromRow, Debug, Clone)]
pub struct WorkspaceMemberEmail {
    pub email: String,
    pub name: String,
}

pub async fn get_workspace_member_emails(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<Vec<WorkspaceMemberEmail>> {
    let members = sqlx::query_as::<_, WorkspaceMemberEmail>(
        "SELECT u.email, u.name
         FROM members_of_workspaces mow
         JOIN users u ON mow.user_id = u.id
         WHERE mow.workspace_id = $1",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    Ok(members)
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
    let projects = sqlx::query_as::<_, ProjectInfo>(
        "SELECT id, name FROM projects WHERE workspace_id = $1",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    Ok(projects)
}

#[derive(FromRow, Debug, Clone)]
pub struct SignalInfo {
    pub id: Uuid,
    pub name: String,
}

pub async fn get_signals_for_project(
    pool: &PgPool,
    project_id: &Uuid,
) -> anyhow::Result<Vec<SignalInfo>> {
    let signals = sqlx::query_as::<_, SignalInfo>(
        "SELECT id, name FROM signals WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(signals)
}

pub async fn get_workspace_name(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<Option<String>> {
    let row = sqlx::query_scalar::<_, String>(
        "SELECT name FROM workspaces WHERE id = $1",
    )
    .bind(workspace_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}
