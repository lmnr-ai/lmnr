use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

/// Whether the project's environment has a repo from a GitHub integration that isn't suspended.
pub async fn has_connected_repos(pool: &PgPool, project_id: Uuid) -> Result<bool> {
    let connected = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1
            FROM project_environment_repos r
            JOIN project_environments e ON e.id = r.environment_id
            JOIN github_integrations g ON g.id = r.integration_id
            WHERE e.project_id = $1 AND g.suspended_at IS NULL
        )",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;
    Ok(connected)
}
