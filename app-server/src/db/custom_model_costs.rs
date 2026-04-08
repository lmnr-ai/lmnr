use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Debug, Clone)]
pub struct DBCustomModelCost {
    #[allow(unused)]
    pub id: Uuid,
    #[allow(unused)]
    pub project_id: Uuid,
    #[allow(unused)]
    pub provider: String,
    #[allow(unused)]
    pub model: String,
    #[allow(unused)]
    pub costs: Value,
}

/// Look up a single custom model cost for a project by exact provider + model name.
/// The provider column is NOT NULL with DEFAULT '' in the DB, so we use simple equality.
pub async fn get_custom_model_cost(
    pool: &PgPool,
    project_id: &Uuid,
    provider: &str,
    model: &str,
) -> anyhow::Result<Option<DBCustomModelCost>> {
    let row = sqlx::query_as::<_, DBCustomModelCost>(
        "SELECT id, project_id, provider, model, costs
         FROM custom_model_costs
         WHERE project_id = $1 AND provider = $2 AND model = $3",
    )
    .bind(project_id)
    .bind(provider)
    .bind(model)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}
