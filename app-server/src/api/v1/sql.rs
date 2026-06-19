use std::{collections::HashMap, sync::Arc};

use actix_limitation::{Error as LimiterError, Limiter};
use actix_web::{HttpResponse, post, web};
use opentelemetry::{
    global,
    trace::{Tracer, mark_span_as_active},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    query_engine::QueryEngine,
    routes::types::ResponseResult,
    sql::{self, ClickhouseReadonlyClient, SqlQuerySource},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
    #[serde(default)]
    pub parameters: HashMap<String, Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryResponse {
    pub data: Vec<serde_json::Value>,
}

#[post("query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    project_api_key: ProjectApiKey,
    limiter: Option<web::Data<Limiter>>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_sql_query(
        project_api_key.project_id,
        req,
        limiter,
        db,
        clickhouse_ro,
        query_engine,
        http_client,
        cache,
    )
    .await
}

/// Shared handler body for `/v1/sql/query` and its CLI twin `/v1/cli/sql/query`.
/// Both surfaces differ only in how they authenticate and resolve `project_id`;
/// everything after that — per-project rate limiting (shared `ratelimit:<id>`
/// key, fail-open), the query span, and the response shape — lives here so the
/// two endpoints can't drift. Rate limiting is inline (not scope middleware)
/// because `project_id` is known only after the auth extractor runs.
#[allow(clippy::too_many_arguments)]
pub async fn handle_sql_query(
    project_id: Uuid,
    req: web::Json<SqlQueryRequest>,
    limiter: Option<web::Data<Limiter>>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    if let Some(limiter) = limiter.as_ref() {
        match limiter.count(format!("ratelimit:{project_id}")).await {
            Ok(_) => {}
            Err(LimiterError::LimitExceeded(_)) => {
                return Ok(HttpResponse::TooManyRequests().finish());
            }
            Err(e) => log::error!("SQL rate limiter error, allowing request: {e:?}"),
        }
    }

    let SqlQueryRequest { query, parameters } = req.into_inner();

    let tracer = global::tracer("tracer");
    let span = tracer.start("api_sql_query");
    let _guard = mark_span_as_active(span);

    match clickhouse_ro.as_ref() {
        Some(ro_client) => {
            match sql::execute_sql_query(
                query,
                project_id,
                parameters,
                SqlQuerySource::Public,
                ro_client.clone(),
                query_engine.into_inner().as_ref().clone(),
                http_client.into_inner(),
                db.into_inner(),
                cache.into_inner(),
            )
            .await
            {
                Ok(result_json) => {
                    Ok(HttpResponse::Ok().json(SqlQueryResponse { data: result_json }))
                }
                Err(e) => Err(e.into()),
            }
        }
        None => Err(anyhow::anyhow!("ClickHouse read-only client is not configured.").into()),
    }
}
