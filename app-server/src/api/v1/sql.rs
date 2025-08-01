use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient},
};

use crate::routes::types::ResponseResult;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
}

#[post("sql/query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    path: web::Path<Uuid>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let SqlQueryRequest { query } = req.into_inner();

    match clickhouse_ro.as_ref() {
        Some(ro_client) => {
            match sql::execute_sql_query(
                query,
                project_id,
                HashMap::new(),
                ro_client.clone(),
                query_engine.into_inner().as_ref().clone(),
            )
            .await
            {
                Ok(result_json) => Ok(HttpResponse::Ok().json(result_json)),
                Err(e) => Err(e.into()),
            }
        }
        None => Err(anyhow::anyhow!("ClickHouse read-only client is not configured.").into()),
    }
}
