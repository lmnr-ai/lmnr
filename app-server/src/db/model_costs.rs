use serde_json::Value;
use sqlx::{FromRow, PgPool};

#[derive(FromRow)]
pub struct DBModelCostEntry {
    #[allow(dead_code)]
    pub model: String,
    pub costs: Value,
}

pub async fn get_model_cost(
    pool: &PgPool,
    model: &str,
) -> anyhow::Result<Option<DBModelCostEntry>> {
    let entry = sqlx::query_as::<_, DBModelCostEntry>(
        "SELECT
            model,
            costs
        FROM
            model_costs
        WHERE
            model = $1
        ORDER BY
            updated_at DESC,
            created_at DESC
        LIMIT 1
        ",
    )
    .bind(model)
    .fetch_optional(pool)
    .await?;

    Ok(entry)
}
