use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool, QueryBuilder};
use uuid::Uuid;

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Dataset {
    pub id: Uuid,
    pub name: String,
    pub project_id: Uuid,
    pub created_at: DateTime<Utc>,
}

/// Get datasets by project id. If ID or name is provided, filter the results accordingly.
pub async fn get_datasets(
    pool: &PgPool,
    project_id: Uuid,
    id: Option<Uuid>,
    name: Option<String>,
) -> Result<Vec<Dataset>> {
    let mut query_builder = QueryBuilder::new(
        r#"SELECT id, name, project_id, created_at FROM datasets WHERE project_id = "#,
    );

    query_builder.push_bind(project_id);
    if let Some(id) = id {
        query_builder.push(" AND id = ");
        query_builder.push_bind(id);
    }
    if let Some(name) = name {
        query_builder.push(" AND name = ");
        query_builder.push_bind(name);
    }
    query_builder.push(" ORDER BY created_at DESC");
    let datasets = query_builder
        .build_query_as::<Dataset>()
        .fetch_all(pool)
        .await?;

    Ok(datasets)
}

pub async fn create_dataset(pool: &PgPool, name: &str, project_id: Uuid) -> Result<Dataset> {
    let dataset = sqlx::query_as::<_, Dataset>(
        "INSERT INTO datasets (name, project_id) VALUES ($1, $2)
        RETURNING id, name, project_id, created_at",
    )
    .bind(name)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(dataset)
}

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
