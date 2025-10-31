use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SlackChannelToEvent {
    pub channel_id: String,
    pub integration_id: Uuid,
}

pub async fn get_channels_for_event(
    pool: &PgPool,
    project_id: Uuid,
    event_name: &str,
) -> anyhow::Result<Vec<SlackChannelToEvent>> {
    let records = sqlx::query_as::<_, SlackChannelToEvent>(
        r#"
        SELECT channel_id, integration_id
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
