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
