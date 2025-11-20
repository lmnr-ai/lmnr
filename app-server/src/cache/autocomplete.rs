use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use chrono::{Duration, Utc};
use clickhouse::Row;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait};
use crate::db::spans::Span;
use crate::query_engine::QueryEngine;
use crate::sql;
use crate::traces::span_attributes::{GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL};

const BACKFILL_LOCK_KEY: &str = "autocomplete:backfill:lock";
const BACKFILL_LOCK_TTL_SECONDS: u64 = 300;
const BACKFILL_SENTINEL_KEY: &str = "autocomplete:backfill:completed";
const BACKFILL_DAYS: i64 = 30;
const PIPELINE_BATCH_SIZE: usize = 500;

#[derive(Row, Deserialize)]
struct ProjectIdRow {
    #[serde(with = "clickhouse::serde::uuid")]
    project_id: Uuid,
}

pub fn autocomplete_key(resource: &str, project_id: Uuid, field: &str) -> String {
    format!("autocomplete:{}:{}:{}", resource, project_id, field)
}

pub async fn is_autocomplete_cache_populated(cache: &Cache) -> bool {
    match cache {
        Cache::Redis(redis) => match redis.get::<String>(BACKFILL_SENTINEL_KEY).await {
            Ok(Some(_)) => true,
            _ => false,
        },
        _ => false,
    }
}

pub async fn backfill_autocomplete_cache(
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    clickhouse_ro: Arc<crate::sql::ClickhouseReadonlyClient>,
    query_engine: Arc<QueryEngine>,
) -> Result<()> {
    let redis_cache = match cache.as_ref() {
        Cache::Redis(redis) => redis,
        _ => {
            log::info!("Skipping autocomplete backfill for non-Redis cache");
            return Ok(());
        }
    };

    if !redis_cache
        .try_acquire_lock(BACKFILL_LOCK_KEY, BACKFILL_LOCK_TTL_SECONDS)
        .await?
    {
        log::info!("Autocomplete backfill already in progress, skipping");
        return Ok(());
    }

    log::info!(
        "Starting autocomplete cache backfill for last {} days",
        BACKFILL_DAYS
    );

    let end_time = Utc::now();
    let start_time = end_time - Duration::days(BACKFILL_DAYS);

    // For getting distinct project_ids, we still use direct clickhouse query
    // since this is a global query not scoped to a specific project
    let project_rows: Vec<ProjectIdRow> = clickhouse
        .query("SELECT DISTINCT project_id FROM spans WHERE start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)}")
        .param("start_time", start_time.naive_utc())
        .param("end_time", end_time.naive_utc())
        .fetch_all()
        .await?;

    for (idx, row) in project_rows.iter().enumerate() {
        let project_id = row.project_id;
        log::info!(
            "Processing project {}/{}: {}",
            idx + 1,
            project_rows.len(),
            project_id
        );

        let fields = [
            (
                "spans",
                "names",
                "SELECT DISTINCT name as value FROM spans WHERE start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND name != ''",
            ),
            (
                "traces",
                "names",
                "SELECT DISTINCT name as value FROM spans WHERE start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND parent_span_id = '00000000-0000-0000-0000-000000000000' AND name != ''",
            ),
            (
                "spans",
                "models",
                "SELECT DISTINCT request_model as value FROM spans WHERE start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND request_model != ''",
            ),
            (
                "spans",
                "models",
                "SELECT DISTINCT response_model as value FROM spans WHERE start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND response_model != ''",
            ),
            (
                "traces",
                "models",
                "SELECT DISTINCT request_model as value FROM spans WHERE start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND parent_span_id = '00000000-0000-0000-0000-000000000000' AND request_model != ''",
            ),
            (
                "traces",
                "models",
                "SELECT DISTINCT response_model as value FROM spans WHERE start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND parent_span_id = '00000000-0000-0000-0000-000000000000' AND response_model != ''",
            ),
            (
                "spans",
                "tags",
                "SELECT DISTINCT name as value FROM tags WHERE created_at >= {start_time:DateTime64(9)} AND created_at < {end_time:DateTime64(9)}",
            ),
            (
                "traces",
                "tags",
                "SELECT DISTINCT name as value FROM tags WHERE created_at >= {start_time:DateTime64(9)} AND created_at < {end_time:DateTime64(9)} AND span_id IN (SELECT top_span_id FROM traces WHERE start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)})",
            ),
        ];

        for (resource, field, query) in fields {
            // Format datetime for ClickHouse DateTime64(9) - needs format without timezone
            let start_time_str = start_time
                .naive_utc()
                .format("%Y-%m-%d %H:%M:%S%.9f")
                .to_string();
            let end_time_str = end_time
                .naive_utc()
                .format("%Y-%m-%d %H:%M:%S%.9f")
                .to_string();

            let parameters = HashMap::from([
                ("start_time".to_string(), Value::String(start_time_str)),
                ("end_time".to_string(), Value::String(end_time_str)),
            ]);

            let result = sql::execute_sql_query(
                query.to_string(),
                project_id,
                parameters,
                clickhouse_ro.clone(),
                query_engine.clone(),
            )
            .await
            .unwrap_or_default();

            if result.is_empty() {
                continue;
            }

            let lowercase_values: Vec<String> = result
                .into_iter()
                .filter_map(|row| {
                    row.get("value")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_lowercase())
                })
                .filter(|v| !v.is_empty())
                .collect();

            if lowercase_values.is_empty() {
                continue;
            }

            let key = autocomplete_key(resource, project_id, field);

            for chunk in lowercase_values.chunks(PIPELINE_BATCH_SIZE) {
                if let Err(e) = redis_cache.pipeline_zadd(&key, chunk).await {
                    log::error!("Failed to pipeline insert into {}: {}", key, e);
                }
            }
        }
    }

    cache.release_lock(BACKFILL_LOCK_KEY).await.ok();

    if let Err(e) = cache.insert(BACKFILL_SENTINEL_KEY, "1").await {
        log::error!("Failed to set backfill sentinel: {}", e);
    }

    log::info!("Autocomplete cache backfill completed successfully");
    Ok(())
}

pub async fn populate_autocomplete_cache(project_id: Uuid, spans: &[Span], cache: Arc<Cache>) {
    let mut span_names = Vec::new();
    let mut trace_names = Vec::new();
    let mut span_tags = Vec::new();
    let mut trace_tags = Vec::new();
    let mut span_models = Vec::new();
    let mut trace_models = Vec::new();

    for span in spans {
        let is_top_level = span.parent_span_id.is_none();

        span_names.push(span.name.to_lowercase());
        if is_top_level {
            trace_names.push(span.name.to_lowercase());
        }

        let tags = span.attributes.tags();
        for tag in tags {
            span_tags.push(tag.to_lowercase());
            if is_top_level {
                trace_tags.push(tag.to_lowercase());
            }
        }

        if let Some(Value::String(request_model)) =
            span.attributes.raw_attributes.get(GEN_AI_REQUEST_MODEL)
        {
            span_models.push(request_model.to_lowercase());
            if is_top_level {
                trace_models.push(request_model.to_lowercase());
            }
        }

        if let Some(Value::String(response_model)) =
            span.attributes.raw_attributes.get(GEN_AI_RESPONSE_MODEL)
        {
            span_models.push(response_model.to_lowercase());
            if is_top_level {
                trace_models.push(response_model.to_lowercase());
            }
        }
    }

    if !span_names.is_empty() {
        let key = autocomplete_key("spans", project_id, "names");
        if let Err(e) = cache.pipeline_zadd(&key, &span_names).await {
            log::error!("Failed to add span names to autocomplete cache: {}", e);
        }
    }

    if !trace_names.is_empty() {
        let key = autocomplete_key("traces", project_id, "names");
        if let Err(e) = cache.pipeline_zadd(&key, &trace_names).await {
            log::error!("Failed to add trace names to autocomplete cache: {}", e);
        }
    }

    if !span_tags.is_empty() {
        let key = autocomplete_key("spans", project_id, "tags");
        if let Err(e) = cache.pipeline_zadd(&key, &span_tags).await {
            log::error!("Failed to add span tags to autocomplete cache: {}", e);
        }
    }

    if !trace_tags.is_empty() {
        let key = autocomplete_key("traces", project_id, "tags");
        if let Err(e) = cache.pipeline_zadd(&key, &trace_tags).await {
            log::error!("Failed to add trace tags to autocomplete cache: {}", e);
        }
    }

    if !span_models.is_empty() {
        let key = autocomplete_key("spans", project_id, "models");
        if let Err(e) = cache.pipeline_zadd(&key, &span_models).await {
            log::error!("Failed to add span models to autocomplete cache: {}", e);
        }
    }

    if !trace_models.is_empty() {
        let key = autocomplete_key("traces", project_id, "models");
        if let Err(e) = cache.pipeline_zadd(&key, &trace_models).await {
            log::error!("Failed to add trace models to autocomplete cache: {}", e);
        }
    }
}
