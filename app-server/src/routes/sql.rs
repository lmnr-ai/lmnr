use std::sync::Arc;

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use uuid::Uuid;

use crate::sql;

use super::ResponseResult;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
}

#[post("sql/query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    path: web::Path<Uuid>,
    client: web::Data<Arc<reqwest::Client>>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let query = req.into_inner().query;

    match sql::execute_sql_query(query, project_id, &client).await {
        Ok(result_json) => Ok(HttpResponse::Ok().json(result_json)),
        Err(e) => Err(e.into()),
    }
}
