use std::sync::Arc;

use actix_web::{HttpResponse, get, post, web};

use crate::{
    api::v1::sql::{SqlQueryRequest, SqlRateLimiter, handle_sql_query},
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    db::DB,
    query_engine::QueryEngine,
    routes::types::ResponseResult,
    sql::ClickhouseReadonlyClient,
};

/// `GET /v1/cli/sql/schema` — the logical tables, columns, and enums a caller
/// may query. Backs `lmnr-cli sql schema`.
///
/// CLI-only on purpose: the CLI is the only consumer, so there is no `/v1`
/// twin. The public SQL surface documents its schema through laminar.sh and the
/// MCP `query_laminar_sql` tool description instead — all three render from
/// `query_engine::schema`, so add a `/v1` twin only when something actually
/// needs it.
///
/// Static per build, so it takes no project scope and hits neither the DB nor
/// ClickHouse; auth exists only to keep the surface consistent with `query`.
#[get("schema")]
pub async fn get_sql_schema(_auth: CliProjectAuth) -> ResponseResult {
    Ok(HttpResponse::Ok().json(crate::query_engine::schema::schema_payload()))
}

/// `POST /v1/cli/sql/query` — CLI twin of `/v1/sql/query`. Delegates to the
/// shared `handle_sql_query` (rate limit + span + response); differs only in
/// auth (`CliProjectAuth` user token vs project API key).
#[post("query")]
pub async fn execute_sql_query(
    auth: CliProjectAuth,
    limiter: Option<web::Data<SqlRateLimiter>>,
    req: web::Json<SqlQueryRequest>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_sql_query(
        auth.project_id,
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
