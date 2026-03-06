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
