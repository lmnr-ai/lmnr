use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AlertInfo {
    pub alert_id: Uuid,
    pub workspace_id: Uuid,
}

/// Look up the alert for a given project and signal event name.
/// Used by the signal postprocessor to discover which alert matches a fired event.
pub async fn get_alert_for_event(
    pool: &PgPool,
    project_id: Uuid,
    event_name: &str,
) -> anyhow::Result<Option<AlertInfo>> {
    let record = sqlx::query_as::<_, AlertInfo>(
        r#"
        SELECT a.id AS alert_id, p.workspace_id
        FROM alerts a
        INNER JOIN signals s ON s.id = a.source_id
        INNER JOIN projects p ON p.id = a.project_id
        WHERE a.project_id = $1
          AND s.name = $2
        LIMIT 1
        "#,
    )
    .bind(project_id)
    .bind(event_name)
    .fetch_optional(pool)
    .await?;

    Ok(record)
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AlertDeliveryTarget {
    pub id: Uuid,
    pub r#type: String,
    pub email: Option<String>,
    pub channel_id: Option<String>,
    pub integration_id: Option<Uuid>,
}

/// Fetch all delivery targets for a specific alert by its ID and project.
pub async fn get_targets_for_alert(
    pool: &PgPool,
    alert_id: &Uuid,
    project_id: &Uuid,
) -> anyhow::Result<Vec<AlertDeliveryTarget>> {
    let targets = sqlx::query_as::<_, AlertDeliveryTarget>(
        "SELECT at.id, at.type, at.email, at.channel_id, at.integration_id
         FROM alert_targets at
         JOIN alerts a ON a.id = at.alert_id
         WHERE at.alert_id = $1 AND a.project_id = $2",
    )
    .bind(alert_id)
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(targets)
}
