use std::sync::Arc;

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};

use crate::{
    data_plane,
    db::{DB, project_api_keys::ProjectApiKey},
    query_engine::QueryEngine,
    routes::types::ResponseResult,
    sql::ClickhouseReadonlyClient,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryResponse {
    pub data: Vec<serde_json::Value>,
}

#[post("sql/query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<Arc<reqwest::Client>>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let SqlQueryRequest { query } = req.into_inner();

    let clickhouse = match clickhouse_ro.as_ref() {
        Some(client) => client.clone(),
        None => {
            return Err(anyhow::anyhow!("ClickHouse read-only client is not configured.").into());
        }
    };

    let data = data_plane::read(
        &db.pool,
        clickhouse,
        http_client.get_ref().clone(),
        query_engine.get_ref().clone(),
        project_id,
        query,
    )
    .await?;

    Ok(HttpResponse::Ok().json(SqlQueryResponse { data }))
}
