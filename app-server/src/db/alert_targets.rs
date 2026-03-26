use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AlertTarget {
    pub id: Uuid,
    pub alert_id: Uuid,
    pub workspace_id: Uuid,
    pub r#type: String,
    pub channel_id: Option<String>,
    pub integration_id: Option<Uuid>,
    pub email: Option<String>,
}

/// Look up all alert targets (SLACK and EMAIL) for a given project and signal event name
/// in a single query.
pub async fn get_targets_for_event(
    pool: &PgPool,
    project_id: Uuid,
    event_name: &str,
) -> anyhow::Result<Vec<AlertTarget>> {
    let records = sqlx::query_as::<_, AlertTarget>(
        r#"
        SELECT at.id, at.alert_id, p.workspace_id,
               at.type, at.channel_id, at.integration_id, at.email
        FROM alert_targets at
        INNER JOIN alerts a ON a.id = at.alert_id
        INNER JOIN signals s ON s.id = a.source_id
        INNER JOIN projects p ON p.id = a.project_id
        WHERE a.project_id = $1
          AND s.name = $2
        "#,
    )
    .bind(project_id)
    .bind(event_name)
    .fetch_all(pool)
    .await?;

    Ok(records)
}
