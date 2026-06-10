use std::sync::Arc;

use actix_limitation::{Error as LimiterError, Limiter};
use actix_web::{HttpResponse, post, web};
use opentelemetry::{
    global,
    trace::{Tracer, mark_span_as_active},
};

use crate::{
    api::v1::sql::{SqlQueryRequest, SqlQueryResponse},
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    db::DB,
    query_engine::QueryEngine,
    routes::types::ResponseResult,
    sql::{self, ClickhouseReadonlyClient},
};

/// `POST /v1/cli/sql/query` — CLI twin of `/v1/sql/query`. Rate limiting is
/// inline (not scope middleware) because the extractor resolves project_id after
/// middleware; shares the `ratelimit:<project_id>` key with `/v1/sql`. Fail-open.
#[post("query")]
pub async fn execute_sql_query(
    auth: CliProjectAuth,
    limiter: Option<web::Data<Limiter>>,
    req: web::Json<SqlQueryRequest>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let project_id = auth.project_id;

    if let Some(limiter) = limiter.as_ref() {
        match limiter.count(format!("ratelimit:{project_id}")).await {
            Ok(_) => {}
            Err(LimiterError::LimitExceeded(_)) => {
                return Ok(HttpResponse::TooManyRequests().finish());
            }
            Err(e) => log::error!("CLI SQL rate limiter error, allowing request: {e:?}"),
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
