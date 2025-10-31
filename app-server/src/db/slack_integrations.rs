use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Clone, Debug)]
pub struct SlackIntegration {
    pub token: String,
    pub team_id: String,
    pub nonce_hex: String,
}

pub async fn get_integration_by_id(
    pool: &PgPool,
    integration_id: &Uuid,
) -> Result<Option<SlackIntegration>> {
    let integration = sqlx::query_as::<_, SlackIntegration>(
        r#"
        SELECT token, team_id, nonce_hex
        FROM slack_integrations
        WHERE id = $1
        "#,
    )
    .bind(integration_id)
    .fetch_optional(pool)
    .await?;

    Ok(integration)
}
