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

/// Look up a single custom model cost for a project by exact provider + model name.
/// Uses `IS NOT DISTINCT FROM` for provider because the column is nullable —
/// `NULL = ''` is NULL (falsy) in PostgreSQL, but `NULL IS NOT DISTINCT FROM NULL` is true.
/// An empty provider string from the Rust backend maps to NULL in the DB.
pub async fn get_custom_model_cost(
    pool: &PgPool,
    project_id: &Uuid,
    provider: &str,
    model: &str,
) -> anyhow::Result<Option<DBCustomModelCost>> {
    // Map empty string to None so the SQL parameter is NULL, matching DB storage.
    let provider_param: Option<&str> = if provider.is_empty() {
        None
    } else {
        Some(provider)
    };

    let row = sqlx::query_as::<_, DBCustomModelCost>(
        "SELECT id, project_id, provider, model, costs
         FROM custom_model_costs
         WHERE project_id = $1 AND provider IS NOT DISTINCT FROM $2 AND model = $3",
    )
    .bind(project_id)
    .bind(provider_param)
    .bind(model)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}
