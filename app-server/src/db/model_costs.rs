use serde_json::Value;
use sqlx::{FromRow, PgPool};

#[derive(FromRow, Debug, Clone)]
pub struct DBModelCost {
    pub model: String,
    pub costs: Value,
}

pub async fn get_model_cost(
    pool: &PgPool,
    model: &str,
) -> anyhow::Result<Option<DBModelCost>> {
    let result = sqlx::query_as::<_, DBModelCost>(
        "SELECT model, costs FROM model_costs WHERE model = $1 LIMIT 1",
    )
    .bind(model)
    .fetch_optional(pool)
    .await?;

    Ok(result)
}
