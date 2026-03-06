use std::collections::HashMap;

use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Debug, Clone)]
pub struct DBCustomModelCost {
    pub id: Uuid,
    pub project_id: Uuid,
    pub provider: Option<String>,
    pub model: String,
    pub costs: Value,
}

/// Batch lookup custom model costs for a project by model lookup keys.
/// Returns a map from model key to the cost entry.
pub async fn get_custom_model_costs_batch(
    pool: &PgPool,
    project_id: &Uuid,
    models: &[String],
) -> anyhow::Result<HashMap<String, DBCustomModelCost>> {
    let rows = sqlx::query_as::<_, DBCustomModelCost>(
        "SELECT id, project_id, provider, model, costs
         FROM custom_model_costs
         WHERE project_id = $1 AND model = ANY($2)",
    )
    .bind(project_id)
    .bind(models)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (r.model.clone(), r)).collect())
}

/// Get all custom model costs for a project.
pub async fn get_all_custom_model_costs(
    pool: &PgPool,
    project_id: &Uuid,
) -> anyhow::Result<Vec<DBCustomModelCost>> {
    let rows = sqlx::query_as::<_, DBCustomModelCost>(
        "SELECT id, project_id, provider, model, costs
         FROM custom_model_costs
         WHERE project_id = $1
         ORDER BY model",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Upsert a custom model cost for a project.
/// If a record with the same (project_id, model) exists, update it.
pub async fn upsert_custom_model_cost(
    pool: &PgPool,
    project_id: &Uuid,
    provider: Option<&str>,
    model: &str,
    costs: &Value,
) -> anyhow::Result<DBCustomModelCost> {
    let row = sqlx::query_as::<_, DBCustomModelCost>(
        "INSERT INTO custom_model_costs (project_id, provider, model, costs)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, model)
         DO UPDATE SET provider = $2, costs = $4, updated_at = now()
         RETURNING id, project_id, provider, model, costs",
    )
    .bind(project_id)
    .bind(provider)
    .bind(model)
    .bind(costs)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// Delete a custom model cost by id and project_id.
pub async fn delete_custom_model_cost(
    pool: &PgPool,
    project_id: &Uuid,
    id: &Uuid,
) -> anyhow::Result<()> {
    let result = sqlx::query(
        "DELETE FROM custom_model_costs WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        anyhow::bail!("Custom model cost not found");
    }

    Ok(())
}

/// Delete all custom model costs for a project (used before copying).
pub async fn delete_all_custom_model_costs(
    pool: &PgPool,
    project_id: &Uuid,
) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM custom_model_costs WHERE project_id = $1")
        .bind(project_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// Copy all custom model costs from one project to another.
/// Deletes existing costs in the target project first.
pub async fn copy_custom_model_costs(
    pool: &PgPool,
    source_project_id: &Uuid,
    target_project_id: &Uuid,
) -> anyhow::Result<Vec<DBCustomModelCost>> {
    // Delete existing costs in target
    delete_all_custom_model_costs(pool, target_project_id).await?;

    // Copy from source to target
    let rows = sqlx::query_as::<_, DBCustomModelCost>(
        "INSERT INTO custom_model_costs (project_id, provider, model, costs)
         SELECT $2, provider, model, costs
         FROM custom_model_costs
         WHERE project_id = $1
         RETURNING id, project_id, provider, model, costs",
    )
    .bind(source_project_id)
    .bind(target_project_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}
