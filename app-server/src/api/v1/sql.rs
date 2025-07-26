use std::{env, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;

use crate::{db::project_api_keys::ProjectApiKey, routes::types::ResponseResult};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
}

#[post("sql/query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    project_api_key: ProjectApiKey,
    client: web::Data<Arc<reqwest::Client>>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let sql_query = req.into_inner().query;
    let Ok(query_engine_url) = env::var("QUERY_ENGINE_URL") else {
        return Ok(HttpResponse::MethodNotAllowed()
            .body("Server not configured to run SQL queries. QUERY_ENGINE_URL is not set."));
    };
    let result = client
        .post(format!("{}", query_engine_url))
        .json(&serde_json::json!({
            "sql_query": sql_query,
            "project_id": project_id,
        }))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to execute SQL query: {}", e))?;

    let result_json = result
        .json::<serde_json::Value>()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse SQL query result: {}", e))?;

    Ok(HttpResponse::Ok().json(result_json))
}
