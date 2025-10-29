use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Clone, Debug)]
pub struct SlackIntegration {
    pub id: Uuid,
    pub project_id: Uuid,
    pub token: String,
    pub team_id: String,
    pub team_name: Option<String>,
    pub nonce_hex: String,
}

pub async fn get_integration_by_id(
    pool: &PgPool,
    integration_id: &Uuid,
) -> Result<Option<SlackIntegration>> {
    let integration = sqlx::query_as::<_, SlackIntegration>(
        r#"
        SELECT id, project_id, token, team_id, team_name, nonce_hex
        FROM slack_integrations
        WHERE id = $1
        "#,
    )
    .bind(integration_id)
    .fetch_optional(pool)
    .await?;

    Ok(integration)
}
