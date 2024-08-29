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

pub async fn inc_count_for_workspace_using_pipeline_version_id(
    pool: &PgPool,
    pipeline_version_id: &uuid::Uuid,
) -> Result<()> {
    sqlx::query!(
        "UPDATE
            run_count
        SET 
            total_count = total_count + 1,
            count_since_reset = count_since_reset + 1
        WHERE workspace_id = (
            SELECT workspace_id FROM projects
            WHERE id = (
                SELECT project_id FROM pipelines
                WHERE id = (
                    SELECT pipeline_id FROM pipeline_versions
                    WHERE id = $1
                )
            )
        )",
        pipeline_version_id
    )
    .execute(pool)
    .await?;

    Ok(())
}
