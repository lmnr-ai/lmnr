use chrono::NaiveDateTime;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Debug, Clone)]
pub struct Report {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub r#type: String,
    pub weekdays: Vec<i32>,
    pub hour: i32,
    pub created_at: NaiveDateTime,
}

pub async fn get_all_reports(pool: &PgPool) -> anyhow::Result<Vec<Report>> {
    let reports = sqlx::query_as::<_, Report>(
        "SELECT id, workspace_id, type, weekdays, hour, created_at
         FROM reports",
    )
    .fetch_all(pool)
    .await?;

    Ok(reports)
}
