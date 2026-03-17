use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SlackAlertTarget {
    pub id: Uuid,
    pub alert_id: Uuid,
    pub workspace_id: Uuid,
    pub channel_id: String,
    pub integration_id: Uuid,
}

/// Look up Slack alert targets for a given project and signal event name.
///
/// Joins alerts → signals (by source_id) → alert_targets to find
/// which Slack channels should be notified when a signal event fires.
pub async fn get_slack_targets_for_event(
    pool: &PgPool,
    project_id: Uuid,
    event_name: &str,
) -> anyhow::Result<Vec<SlackAlertTarget>> {
    let records = sqlx::query_as::<_, SlackAlertTarget>(
        r#"
        SELECT at.id, at.alert_id, p.workspace_id,
               at.channel_id, at.integration_id
        FROM alert_targets at
        INNER JOIN alerts a ON a.id = at.alert_id
        INNER JOIN signals s ON s.id = a.source_id
        INNER JOIN projects p ON p.id = a.project_id
        WHERE a.project_id = $1
          AND s.name = $2
          AND at.type = 'SLACK'
          AND at.channel_id IS NOT NULL
        "#,
    )
    .bind(project_id)
    .bind(event_name)
    .fetch_all(pool)
    .await?;

    Ok(records)
}
