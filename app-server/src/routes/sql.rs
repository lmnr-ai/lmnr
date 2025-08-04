use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    query_engine::{QueryEngine, QueryEngineTrait, QueryEngineValidationResult},
    sql::{self, ClickhouseReadonlyClient},
};

use super::ResponseResult;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
    #[serde(default)]
    pub parameters: HashMap<String, Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlValidateRequest {
    pub query: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlValidateResponse {
    pub success: bool,
    pub validated_query: Option<String>,
    pub error: Option<String>,
}

#[post("sql/query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    path: web::Path<Uuid>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let SqlQueryRequest { query, parameters } = req.into_inner();

    match clickhouse_ro.as_ref() {
        Some(ro_client) => {
            match sql::execute_sql_query(
                query,
                project_id,
                parameters,
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

#[post("sql/validate")]
pub async fn validate_sql_query(
    req: web::Json<SqlValidateRequest>,
    path: web::Path<Uuid>,
    query_engine: web::Data<Arc<QueryEngine>>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let SqlValidateRequest { query } = req.into_inner();

    match query_engine
        .into_inner()
        .as_ref()
        .validate_query(query, project_id)
        .await
    {
        Ok(validation_result) => {
            let response = match validation_result {
                QueryEngineValidationResult::Success {
                    success,
                    validated_query,
                } => SqlValidateResponse {
                    success,
                    validated_query: Some(validated_query),
                    error: None,
                },
                QueryEngineValidationResult::Error { error } => SqlValidateResponse {
                    success: false,
                    validated_query: None,
                    error: Some(error),
                },
            };
            Ok(HttpResponse::Ok().json(response))
        }
        Err(e) => Err(e.into()),
    }
}
