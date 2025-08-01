use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{query_engine::QueryEngine, sql};

use super::ResponseResult;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
    pub parameters: HashMap<String, Value>,
}

#[post("sql/query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    path: web::Path<Uuid>,
    clickhouse: web::Data<clickhouse::Client>,
    query_engine: web::Data<Arc<QueryEngine>>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let SqlQueryRequest { query, parameters } = req.into_inner();

    match sql::execute_sql_query(
        query,
        project_id,
        parameters,
        clickhouse.into_inner().as_ref().clone(),
        query_engine.into_inner().as_ref().clone(),
    )
    .await
    {
        Ok(result_json) => Ok(HttpResponse::Ok().json(result_json)),
        Err(e) => Err(e.into()),
    }
}
