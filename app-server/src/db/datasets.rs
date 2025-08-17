use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn get_dataset_id_by_name(
    pool: &PgPool,
    name: &str,
    project_id: Uuid,
) -> Result<Option<Uuid>> {
    let dataset_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM datasets WHERE name = $1 AND project_id = $2",
    )
    .bind(name)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(dataset_id)
}

pub async fn get_parquet_path(
    pool: &PgPool,
    project_id: Uuid,
    dataset_id: Uuid,
    name: &str,
) -> Result<Option<String>> {
    let parquet_path = sqlx::query_scalar::<_, String>(
        "
        SELECT dp.parquet_path
        FROM dataset_parquets dp
        JOIN datasets d ON dp.dataset_id = d.id
        WHERE d.project_id = $1 AND dp.dataset_id = $2 AND dp.name = $3
        ORDER BY dp.created_at DESC, dp.id ASC
        ",
    )
    .bind(project_id)
    .bind(dataset_id)
    .bind(name)
    .fetch_optional(pool)
    .await?;

    Ok(parquet_path)
}
