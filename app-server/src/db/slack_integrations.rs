use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Clone, Debug)]
pub struct SlackIntegration {
    pub token: String,
    pub team_id: String,
    pub nonce_hex: String,
    /// Only set by `get_integration_by_id`; self-hosted tiers (e.g. "unlimited") never match.
    #[sqlx(default)]
    pub free_tier: bool,
}

pub async fn get_integration_by_id(
    pool: &PgPool,
    integration_id: &Uuid,
) -> Result<Option<SlackIntegration>> {
    let integration = sqlx::query_as::<_, SlackIntegration>(
        r#"
        SELECT si.token, si.team_id, si.nonce_hex, LOWER(TRIM(st.name)) = 'free' AS free_tier
        FROM slack_integrations si
        JOIN workspaces w ON w.id = si.workspace_id
        JOIN subscription_tiers st ON st.id = w.tier_id
        WHERE si.id = $1
        "#,
    )
    .bind(integration_id)
    .fetch_optional(pool)
    .await?;

    Ok(integration)
}
