use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use opentelemetry::{
    KeyValue, global,
    trace::{Span as OtelSpanTrait, Tracer, mark_span_as_active},
};
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlToJsonRequest {
    pub sql: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlToJsonResponse {
    pub success: bool,
    pub query_structure: Option<crate::query_engine::query_engine::QueryStructure>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonToSqlRequest {
    pub query_structure: crate::query_engine::query_engine::QueryStructure,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonToSqlResponse {
    pub success: bool,
    pub sql: Option<String>,
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

    let tracer = global::tracer("app-server");
    let mut span = tracer.start("frontend_sql_query");
    span.set_attribute(KeyValue::new("project_id", project_id.to_string()));
    span.set_attribute(KeyValue::new("sql.query", query.clone()));
    let _guard = mark_span_as_active(span);

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
        None => Err(anyhow::anyhow!("ClickHouse client is not configured.").into()),
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
                QueryEngineValidationResult::Success { validated_query } => SqlValidateResponse {
                    success: true,
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

#[post("sql/to-json")]
pub async fn sql_to_json(
    req: web::Json<SqlToJsonRequest>,
    query_engine: web::Data<Arc<QueryEngine>>,
) -> ResponseResult {
    let SqlToJsonRequest { sql } = req.into_inner();

    match query_engine
        .into_inner()
        .as_ref()
        .sql_to_json(sql)
        .await
    {
        Ok(query_structure) => {
            let response = SqlToJsonResponse {
                success: true,
                query_structure: Some(query_structure),
                error: None,
            };
            Ok(HttpResponse::Ok().json(response))
        }
        Err(e) => {
            let response = SqlToJsonResponse {
                success: false,
                query_structure: None,
                error: Some(e.to_string()),
            };
            Ok(HttpResponse::Ok().json(response))
        }
    }
}

#[post("sql/from-json")]
pub async fn json_to_sql(
    req: web::Json<JsonToSqlRequest>,
    query_engine: web::Data<Arc<QueryEngine>>,
) -> ResponseResult {
    let JsonToSqlRequest { query_structure } = req.into_inner();

    match query_engine
        .into_inner()
        .as_ref()
        .json_to_sql(query_structure)
        .await
    {
        Ok(sql) => {
            let response = JsonToSqlResponse {
                success: true,
                sql: Some(sql),
                error: None,
            };
            Ok(HttpResponse::Ok().json(response))
        }
        Err(e) => {
            let response = JsonToSqlResponse {
                success: false,
                sql: None,
                error: Some(e.to_string()),
            };
            Ok(HttpResponse::Ok().json(response))
        }
    }
}
