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

const UPSERT_CHUNK_SIZE: usize = 500;

/// Upserts `(model, costs)` rows in one transaction, chunked to bound the
/// statement size. Rows must have unique models.
pub async fn upsert_model_costs(pool: &PgPool, rows: &[(String, Value)]) -> anyhow::Result<()> {
    let mut tx = pool.begin().await?;
    for chunk in rows.chunks(UPSERT_CHUNK_SIZE) {
        let (models, costs): (Vec<String>, Vec<Value>) = chunk.iter().cloned().unzip();
        sqlx::query(
            "INSERT INTO model_costs (model, costs, updated_at)
             SELECT model, costs, now() FROM UNNEST($1::text[], $2::jsonb[]) AS t(model, costs)
             ON CONFLICT ON CONSTRAINT model_costs_model_unique
             DO UPDATE SET costs = EXCLUDED.costs, updated_at = now()",
        )
        .bind(&models)
        .bind(&costs)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
