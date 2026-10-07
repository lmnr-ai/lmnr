use std::collections::HashMap;

use serde_json::Value;
use sqlx::{FromRow, PgPool};

#[derive(FromRow, Debug, Clone)]
#[allow(dead_code)]
pub struct DBModelCost {
    pub model: String,
    pub costs: Value,
}

pub async fn get_model_costs_batch(
    pool: &PgPool,
    models: &[String],
) -> anyhow::Result<HashMap<String, DBModelCost>> {
    let rows = sqlx::query_as::<_, DBModelCost>(
        "SELECT model, costs FROM model_costs WHERE model = ANY($1)",
    )
    .bind(models)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (r.model.clone(), r)).collect())
}
