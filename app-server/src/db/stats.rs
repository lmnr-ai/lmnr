use anyhow::Result;
use sqlx::PgPool;

pub async fn create_run_count_for_workspace(
    pool: &PgPool,
    workspace_id: &uuid::Uuid,
) -> Result<()> {
    sqlx::query("INSERT INTO run_count (workspace_id) VALUES ($1);")
        .bind(workspace_id)
        .execute(pool)
        .await?;

    Ok(())
}
