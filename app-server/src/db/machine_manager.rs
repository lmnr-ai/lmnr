use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn create_machine(pool: &PgPool, machine_id: Uuid, project_id: Uuid) -> Result<()> {
    sqlx::query!(
        r"INSERT INTO machines (id, project_id) VALUES ($1, $2)",
        machine_id,
        project_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_machine(pool: &PgPool, machine_id: Uuid, project_id: Uuid) -> Result<()> {
    sqlx::query!(
        r"DELETE FROM machines WHERE id = $1 AND project_id = $2",
        machine_id,
        project_id
    )
    .execute(pool)
    .await?;
    Ok(())
}
