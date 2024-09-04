use anyhow::Result;
use sqlx::PgPool;

pub async fn create_run_count_for_workspace(
    pool: &PgPool,
    workspace_id: &uuid::Uuid,
) -> Result<()> {
    sqlx::query!(
        "insert into run_count (workspace_id) values ($1);",
        workspace_id
    )
    .execute(pool)
    .await?;

    Ok(())
}
