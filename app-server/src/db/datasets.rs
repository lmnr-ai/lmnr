use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn get_dataset_id_by_name(pool: &PgPool, name: &str, project_id: Uuid) -> Result<Uuid> {
    let dataset_id =
        sqlx::query_as::<_, (Uuid,)>("SELECT id FROM datasets WHERE name = $1 AND project_id = $2")
            .bind(name)
            .bind(project_id)
            .fetch_optional(pool)
            .await?
            .map(|(id,)| id)
            .ok_or_else(|| anyhow::anyhow!("Dataset not found"))?;

    Ok(dataset_id)
}
