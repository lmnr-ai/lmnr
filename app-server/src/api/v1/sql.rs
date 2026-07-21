use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use opentelemetry::{
    global,
    trace::{Tracer, mark_span_as_active},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheError, CacheTrait,
        keys::{
            SQL_RATE_LIMIT_CACHE_KEY, SQL_RATE_LIMIT_COUNT_CACHE_KEY,
            SQL_RATE_LIMIT_PERIOD_CACHE_KEY,
        },
    },
    db::{DB, project_api_keys::ProjectApiKey},
    query_engine::QueryEngine,
    routes::types::ResponseResult,
    sql::{self, ClickhouseReadonlyClient, SqlQuerySource},
};

/// Global defaults for the per-project SQL rate limit. Registered as app_data
/// in main.rs only when `Feature::RateLimiter` is enabled; per-project
/// overrides are read from cache in `check_sql_rate_limit`.
#[derive(Clone, Copy)]
pub struct SqlRateLimitConfig {
    pub default_limit: u64,
    pub default_period_secs: u64,
}

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
    rate_limit_config: Option<web::Data<SqlRateLimitConfig>>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_sql_query(
        project_api_key.project_id,
        req,
        rate_limit_config,
        db,
        clickhouse_ro,
        query_engine,
        http_client,
        cache,
    )
    .await
}

/// Fixed-window per-project rate limit for the SQL surface. Limit N and
/// period T resolve independently: cache override
/// (`sql_rate_limit:{id}` / `sql_rate_limit_period:{id}`) if present, else the
/// global default from env. Returns Ok(true) when the request is allowed.
async fn check_sql_rate_limit(
    cache: &Cache,
    config: &SqlRateLimitConfig,
    project_id: Uuid,
) -> Result<bool, CacheError> {
    let limit = cache
        .get::<u64>(&format!("{SQL_RATE_LIMIT_CACHE_KEY}:{project_id}"))
        .await?
        .unwrap_or(config.default_limit);
    let period_secs = cache
        .get::<u64>(&format!("{SQL_RATE_LIMIT_PERIOD_CACHE_KEY}:{project_id}"))
        .await?
        .filter(|p| *p > 0)
        .unwrap_or(config.default_period_secs);
    if period_secs == 0 {
        // Redis rejects `EX 0`, which would strand a TTL-less counter.
        // A zero period is a misconfiguration — fail open like cache errors.
        log::error!("SQL rate limit period is 0 (misconfigured), allowing request");
        return Ok(true);
    }

    let count_key = format!("{SQL_RATE_LIMIT_COUNT_CACHE_KEY}:{project_id}");
    // Create-with-expiry + increment run atomically, so the counter can
    // never exist without a TTL (a stuck counter would 429 the project
    // until manual deletion).
    let count = cache
        .increment_with_ttl_on_create(&count_key, 1, period_secs)
        .await?;
    Ok(count as u64 <= limit)
}

/// Shared handler body for `/v1/sql/query` and its CLI twin `/v1/cli/sql/query`.
/// Both surfaces differ only in how they authenticate and resolve `project_id`;
/// everything after that — per-project rate limiting (fail-open), the query
/// span, and the response shape — lives here so the two endpoints can't drift.
/// Rate limiting is inline (not scope middleware) because `project_id` is
/// known only after the auth extractor runs.
#[allow(clippy::too_many_arguments)]
pub async fn handle_sql_query(
    project_id: Uuid,
    req: web::Json<SqlQueryRequest>,
    rate_limit_config: Option<web::Data<SqlRateLimitConfig>>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    if let Some(config) = rate_limit_config.as_ref() {
        match check_sql_rate_limit(cache.get_ref(), config, project_id).await {
            Ok(true) => {}
            Ok(false) => {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    const CONFIG: SqlRateLimitConfig = SqlRateLimitConfig {
        default_limit: 3,
        default_period_secs: 60,
    };

    fn cache() -> Cache {
        Cache::InMemory(InMemoryCache::new(Some(1000)))
    }

    #[tokio::test]
    async fn global_default_applies_without_override() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        for _ in 0..3 {
            assert!(
                check_sql_rate_limit(&cache, &CONFIG, project_id)
                    .await
                    .unwrap()
            );
        }
        assert!(
            !check_sql_rate_limit(&cache, &CONFIG, project_id)
                .await
                .unwrap()
        );
    }

    #[tokio::test]
    async fn per_project_limit_override() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        cache
            .insert(&format!("{SQL_RATE_LIMIT_CACHE_KEY}:{project_id}"), 1u64)
            .await
            .unwrap();
        assert!(
            check_sql_rate_limit(&cache, &CONFIG, project_id)
                .await
                .unwrap()
        );
        assert!(
            !check_sql_rate_limit(&cache, &CONFIG, project_id)
                .await
                .unwrap()
        );
    }

    #[tokio::test]
    async fn zero_period_fails_open() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        // Zero period override falls back to the default period — still limited.
        cache
            .insert(
                &format!("{SQL_RATE_LIMIT_PERIOD_CACHE_KEY}:{project_id}"),
                0u64,
            )
            .await
            .unwrap();
        for _ in 0..3 {
            assert!(
                check_sql_rate_limit(&cache, &CONFIG, project_id)
                    .await
                    .unwrap()
            );
        }
        assert!(
            !check_sql_rate_limit(&cache, &CONFIG, project_id)
                .await
                .unwrap()
        );

        // Zero default period (env misconfig) fails open instead of
        // stranding a TTL-less counter.
        let zero_config = SqlRateLimitConfig {
            default_limit: 1,
            default_period_secs: 0,
        };
        let other = Uuid::new_v4();
        for _ in 0..3 {
            assert!(
                check_sql_rate_limit(&cache, &zero_config, other)
                    .await
                    .unwrap()
            );
        }
    }

    #[tokio::test]
    async fn override_is_per_project() {
        let cache = cache();
        let limited = Uuid::new_v4();
        let other = Uuid::new_v4();
        cache
            .insert(&format!("{SQL_RATE_LIMIT_CACHE_KEY}:{limited}"), 0u64)
            .await
            .unwrap();
        assert!(
            !check_sql_rate_limit(&cache, &CONFIG, limited)
                .await
                .unwrap()
        );
        assert!(check_sql_rate_limit(&cache, &CONFIG, other).await.unwrap());
    }
}
