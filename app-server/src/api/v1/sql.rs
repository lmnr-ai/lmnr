use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use serde_json::Value;

use crate::{db::project_api_keys::ProjectApiKey, routes::types::ResponseResult, sql};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
    pub parameters: HashMap<String, Value>,
}

#[post("sql/query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    project_api_key: ProjectApiKey,
    client: web::Data<Arc<reqwest::Client>>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let SqlQueryRequest { query, parameters } = req.into_inner();

    match sql::execute_sql_query(query, project_id, parameters, &client).await {
        Ok(result_json) => Ok(HttpResponse::Ok().json(result_json)),
        Err(e) => Err(e.into()),
    }
}
