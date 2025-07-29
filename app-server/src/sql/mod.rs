use serde_json::Value;
use std::{env, sync::Arc};
use uuid::Uuid;

pub async fn execute_sql_query(
    query: String,
    project_id: Uuid,
    client: &Arc<reqwest::Client>,
) -> Result<Value, anyhow::Error> {
    let query_engine_url = env::var("QUERY_ENGINE_URL").map_err(|_| {
        anyhow::anyhow!("Server not configured to run SQL queries. QUERY_ENGINE_URL is not set.")
    })?;

    let result = client
        .post(format!("{}", query_engine_url))
        .json(&serde_json::json!({
            "query": query,
            "project_id": project_id,
        }))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to execute SQL query: {}", e))?;

    let result_json = result
        .json::<Value>()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse SQL query result: {}", e))?;

    Ok(result_json)
}
