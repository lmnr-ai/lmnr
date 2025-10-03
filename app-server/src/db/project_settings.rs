use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ProjectSetting {
    pub id: Uuid,
    pub name: Option<String>,
    pub value: Option<String>,
    pub project_id: Uuid,
}

/// Get a specific project setting by name
pub async fn get_project_setting(
    pool: &PgPool,
    project_id: &Uuid,
    setting_name: &str,
) -> Result<Option<ProjectSetting>> {
    let setting = sqlx::query_as::<_, ProjectSetting>(
        "SELECT id, name, value, project_id
         FROM project_settings
         WHERE project_id = $1 AND name = $2
         LIMIT 1",
    )
    .bind(project_id)
    .bind(setting_name)
    .fetch_optional(pool)
    .await?;

    Ok(setting)
}

/// Check if a project setting is enabled (value = 'true')
pub async fn is_project_setting_enabled(
    pool: &PgPool,
    project_id: &Uuid,
    setting_name: &str,
) -> Result<bool> {
    let setting = get_project_setting(pool, project_id, setting_name).await?;

    Ok(setting
        .and_then(|s| s.value)
        .map(|v| v.trim().to_lowercase() == "true")
        .unwrap_or(false))
}
