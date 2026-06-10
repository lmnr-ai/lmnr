use std::sync::Arc;

use actix_limitation::{Error as LimiterError, Limiter};
use actix_web::{HttpResponse, post, web};

use crate::{
    api::v1::sql::{SqlQueryRequest, run_sql_query},
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    db::DB,
    query_engine::QueryEngine,
    routes::types::ResponseResult,
    sql::ClickhouseReadonlyClient,
};

/// `POST /v1/cli/sql/query` — CLI twin of `/v1/sql/query`. User-token auth via
/// `CliProjectAuth`.
///
/// Rate limiting is applied INLINE here, not as scope middleware: the project
/// id is resolved by the `CliProjectAuth` extractor, which runs AFTER all
/// middleware, so a `RateLimiter` middleware's `key_by` would find no project
/// id and silently stop limiting. We count manually after auth — same pattern
/// as gRPC ingestion. Shares the `ratelimit:<project_id>` Redis key with
/// `/v1/sql` so the CLI can't bypass the per-project quota. Fail-open on
/// Redis/infra errors (mirrors the gRPC + bytes-limit posture).
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

    run_sql_query(
        project_id,
        req.into_inner(),
        db,
        clickhouse_ro,
        query_engine,
        http_client,
        cache,
    )
    .await
}
