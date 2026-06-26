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

/// Slack integration plus the owning workspace — the inbound-events path resolves a workspace from
/// the event's `team_id`, then decodes the bot token to reply.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
#[derive(FromRow, Clone, Debug)]
pub struct SlackIntegrationWithWorkspace {
    pub token: String,
    pub team_id: String,
    pub nonce_hex: String,
    pub workspace_id: Uuid,
}

/// Look up the (single) Slack integration for a Slack workspace by its `team_id`. A team installs
/// the app once per workspace, so this resolves the Laminar `workspace_id` for an inbound event.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn get_integration_by_team_id(
    pool: &PgPool,
    team_id: &str,
) -> Result<Option<SlackIntegrationWithWorkspace>> {
    let integration = sqlx::query_as::<_, SlackIntegrationWithWorkspace>(
        r#"
        SELECT token, team_id, nonce_hex, workspace_id
        FROM slack_integrations
        WHERE team_id = $1
        LIMIT 1
        "#,
    )
    .bind(team_id)
    .fetch_optional(pool)
    .await?;

    Ok(integration)
}

/// Resolve which Laminar project an inbound Slack `@mention` should route to: the project an admin
/// bound to this Slack channel in workspace integration settings (`slack_channel_projects`). `None`
/// ⇒ the channel is unbound; the events handler tells the user to connect a project in settings.
/// Scoped to `workspace_id` so a channel id can only resolve to a project the installing team owns.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn get_project_for_channel(
    pool: &PgPool,
    workspace_id: Uuid,
    channel_id: &str,
) -> Result<Option<Uuid>> {
    let project_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT project_id
        FROM slack_channel_projects
        WHERE workspace_id = $1 AND channel_id = $2
        LIMIT 1
        "#,
    )
    .bind(workspace_id)
    .bind(channel_id)
    .fetch_optional(pool)
    .await?;

    Ok(project_id)
}
