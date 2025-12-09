use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::events::EventSource;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EventClusterConfig {
    pub value_template: String,
}

/// Get event cluster config for a specific event name and project
pub async fn get_event_cluster_config(
    pool: &PgPool,
    project_id: Uuid,
    event_name: &str,
    source: EventSource,
) -> Result<Option<EventClusterConfig>> {
    let config = sqlx::query_as::<_, EventClusterConfig>(
        r#"
        SELECT value_template
        FROM event_cluster_configs
        WHERE project_id = $1 AND event_name = $2 AND source = $3
        "#,
    )
    .bind(project_id)
    .bind(event_name)
    .bind(source.to_string())
    .fetch_optional(pool)
    .await?;

    Ok(config)
}
