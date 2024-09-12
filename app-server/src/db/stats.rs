use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn create_usage_stats_for_workspace(pool: &PgPool, workspace_id: &Uuid) -> Result<()> {
    sqlx::query("INSERT INTO workspace_usage (workspace_id) VALUES ($1);")
        .bind(workspace_id)
        .execute(pool)
        .await?;

    Ok(())
}
