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

/// Look up an arbitrary Slack integration for a Slack `team_id` — only used to obtain a bot token to
/// REPLY with when a channel has no project binding (the setup-hint nudge). `team_id` is not unique
/// (a team can be connected to multiple Laminar workspaces), but every such install is the same Slack
/// bot user, so any of their tokens can post the reply. Do NOT use this for routing — route via
/// `get_channel_binding`, which is deterministic.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn get_integration_by_team_id(
    pool: &PgPool,
    team_id: &str,
) -> Result<Option<SlackIntegration>> {
    let integration = sqlx::query_as::<_, SlackIntegration>(
        r#"
        SELECT token, team_id, nonce_hex
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

/// The bound project plus the exact integration to reply with, resolved for one inbound `@mention`.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
#[derive(FromRow, Clone, Debug)]
pub struct ChannelProjectBinding {
    pub project_id: Uuid,
    pub token: String,
    pub team_id: String,
    pub nonce_hex: String,
}

/// Resolve which Laminar project an inbound Slack `@mention` routes to, joining the channel binding
/// to its OWN integration via `slack_channel_projects.integration_id`. This is deterministic even
/// when one Slack team is connected to multiple Laminar workspaces — the binding pins the exact
/// install, so we never have to resolve a workspace from the non-unique `team_id` (the source of the
/// "no project connected" misroute). `team_id` is matched as a scope guard so a channel id from one
/// team can't route to a binding whose integration belongs to another.
///
/// At most one row can match: `slack_channel_projects.channel_id` is UNIQUE, so a channel can be bound
/// to exactly one project instance-wide — the `@mention` router never has to disambiguate. Returns the
/// project plus that integration's token to reply with; `None` ⇒ the channel is unbound.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn get_channel_binding(
    pool: &PgPool,
    team_id: &str,
    channel_id: &str,
) -> Result<Option<ChannelProjectBinding>> {
    let binding = sqlx::query_as::<_, ChannelProjectBinding>(
        r#"
        SELECT scp.project_id, si.token, si.team_id, si.nonce_hex
        FROM slack_channel_projects scp
        JOIN slack_integrations si ON si.id = scp.integration_id
        WHERE si.team_id = $1 AND scp.channel_id = $2
        "#,
    )
    .bind(team_id)
    .bind(channel_id)
    .fetch_optional(pool)
    .await?;

    Ok(binding)
}
