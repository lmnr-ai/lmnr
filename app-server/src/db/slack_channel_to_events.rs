use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SlackChannelToEvent {
    pub id: Uuid,
    pub channel_id: String,
    pub project_id: Uuid,
    pub event_name: String,
    pub integration_id: Uuid,
}

pub async fn get_channels_for_event(
    pool: &PgPool,
    project_id: Uuid,
    event_name: &str,
) -> anyhow::Result<Vec<SlackChannelToEvent>> {
    let records = sqlx::query_as::<_, SlackChannelToEvent>(
        r#"
        SELECT id, channel_id, project_id, event_name, integration_id
        FROM slack_channel_to_events
        WHERE project_id = $1 AND event_name = $2
        "#,
    )
    .bind(project_id)
    .bind(event_name)
    .fetch_all(pool)
    .await?;

    Ok(records)
}
