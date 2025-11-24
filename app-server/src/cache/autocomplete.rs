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

pub fn autocomplete_original_key(resource: &str, project_id: Uuid, field: &str) -> String {
    format!(
        "autocomplete:{}:{}:{}:original",
        resource, project_id, field
    )
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

            // Collect both lowercase and original values
            let mut lowercase_values = Vec::new();
            let mut originals_map: HashMap<String, String> = HashMap::new();

            for row in result {
                if let Some(original_value) = row.get("value").and_then(|v| v.as_str()) {
                    if original_value.is_empty() {
                        continue;
                    }
                    let lowercase = original_value.to_lowercase();
                    lowercase_values.push(lowercase.clone());

                    // Only store if original differs from lowercase (optimization)
                    if lowercase != original_value {
                        originals_map.insert(lowercase, original_value.to_string());
                    }
                }
            }

            if lowercase_values.is_empty() {
                continue;
            }

            let key = autocomplete_key(resource, project_id, field);

            // Store lowercase values in sorted set for search
            for chunk in lowercase_values.chunks(PIPELINE_BATCH_SIZE) {
                if let Err(e) = redis_cache.pipe_zadd(&key, chunk).await {
                    log::error!("Failed to pipeline insert into {}: {}", key, e);
                }
            }

            if !originals_map.is_empty() {
                let original_key = autocomplete_original_key(resource, project_id, field);
                let field_values: Vec<(String, String)> = originals_map.into_iter().collect();

                for chunk in field_values.chunks(PIPELINE_BATCH_SIZE) {
                    if let Err(e) = redis_cache.pipe_hset(&original_key, chunk).await {
                        log::error!(
                            "Failed to pipeline insert originals into {}: {}",
                            original_key,
                            e
                        );
                    }
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
    let mut span_names_lowercase = Vec::new();
    let mut trace_names_lowercase = Vec::new();
    let mut span_tags_lowercase = Vec::new();
    let mut trace_tags_lowercase = Vec::new();
    let mut span_models_lowercase = Vec::new();
    let mut trace_models_lowercase = Vec::new();

    let mut span_names_originals: HashMap<String, String> = HashMap::new();
    let mut trace_names_originals: HashMap<String, String> = HashMap::new();
    let mut span_tags_originals: HashMap<String, String> = HashMap::new();
    let mut trace_tags_originals: HashMap<String, String> = HashMap::new();
    let mut span_models_originals: HashMap<String, String> = HashMap::new();
    let mut trace_models_originals: HashMap<String, String> = HashMap::new();

    for span in spans {
        let is_top_level = span.parent_span_id.is_none();

        // Process span names
        let span_name_lowercase = span.name.to_lowercase();
        span_names_lowercase.push(span_name_lowercase.clone());
        if span_name_lowercase != span.name {
            span_names_originals.insert(span_name_lowercase.clone(), span.name.clone());
        }

        if is_top_level {
            trace_names_lowercase.push(span_name_lowercase.clone());
            if span_name_lowercase != span.name {
                trace_names_originals.insert(span_name_lowercase, span.name.clone());
            }
        }

        // Process tags
        let tags = span.attributes.tags();
        for tag in tags {
            let tag_lowercase = tag.to_lowercase();
            span_tags_lowercase.push(tag_lowercase.clone());
            if tag_lowercase != tag {
                span_tags_originals.insert(tag_lowercase.clone(), tag.to_string());
            }

            if is_top_level {
                trace_tags_lowercase.push(tag_lowercase.clone());
                if tag_lowercase != tag {
                    trace_tags_originals.insert(tag_lowercase, tag.to_string());
                }
            }
        }

        // Process request model
        if let Some(Value::String(request_model)) =
            span.attributes.raw_attributes.get(GEN_AI_REQUEST_MODEL)
        {
            let model_lowercase = request_model.to_lowercase();
            span_models_lowercase.push(model_lowercase.clone());
            if model_lowercase != request_model.as_str() {
                span_models_originals.insert(model_lowercase.clone(), request_model.clone());
            }

            if is_top_level {
                trace_models_lowercase.push(model_lowercase.clone());
                if model_lowercase != request_model.as_str() {
                    trace_models_originals.insert(model_lowercase, request_model.clone());
                }
            }
        }

        // Process response model
        if let Some(Value::String(response_model)) =
            span.attributes.raw_attributes.get(GEN_AI_RESPONSE_MODEL)
        {
            let model_lowercase = response_model.to_lowercase();
            span_models_lowercase.push(model_lowercase.clone());
            if model_lowercase != response_model.as_str() {
                span_models_originals.insert(model_lowercase.clone(), response_model.clone());
            }

            if is_top_level {
                trace_models_lowercase.push(model_lowercase.clone());
                if model_lowercase != response_model.as_str() {
                    trace_models_originals.insert(model_lowercase, response_model.clone());
                }
            }
        }
    }

    // Store span names
    if !span_names_lowercase.is_empty() {
        let key = autocomplete_key("spans", project_id, "names");
        if let Err(e) = cache.pipe_zadd(&key, &span_names_lowercase).await {
            log::error!("Failed to add span names to autocomplete cache: {}", e);
        }

        if !span_names_originals.is_empty() {
            let original_key = autocomplete_original_key("spans", project_id, "names");
            let field_values: Vec<(String, String)> = span_names_originals.into_iter().collect();
            if let Err(e) = cache.pipe_hset(&original_key, &field_values).await {
                log::error!(
                    "Failed to add span name originals to autocomplete cache: {}",
                    e
                );
            }
        }
    }

    // Store trace names
    if !trace_names_lowercase.is_empty() {
        let key = autocomplete_key("traces", project_id, "names");
        if let Err(e) = cache.pipe_zadd(&key, &trace_names_lowercase).await {
            log::error!("Failed to add trace names to autocomplete cache: {}", e);
        }

        if !trace_names_originals.is_empty() {
            let original_key = autocomplete_original_key("traces", project_id, "names");
            let field_values: Vec<(String, String)> = trace_names_originals.into_iter().collect();
            if let Err(e) = cache.pipe_hset(&original_key, &field_values).await {
                log::error!(
                    "Failed to add trace name originals to autocomplete cache: {}",
                    e
                );
            }
        }
    }

    // Store span tags
    if !span_tags_lowercase.is_empty() {
        let key = autocomplete_key("spans", project_id, "tags");
        if let Err(e) = cache.pipe_zadd(&key, &span_tags_lowercase).await {
            log::error!("Failed to add span tags to autocomplete cache: {}", e);
        }

        if !span_tags_originals.is_empty() {
            let original_key = autocomplete_original_key("spans", project_id, "tags");
            let field_values: Vec<(String, String)> = span_tags_originals.into_iter().collect();
            if let Err(e) = cache.pipe_hset(&original_key, &field_values).await {
                log::error!(
                    "Failed to add span tag originals to autocomplete cache: {}",
                    e
                );
            }
        }
    }

    // Store trace tags
    if !trace_tags_lowercase.is_empty() {
        let key = autocomplete_key("traces", project_id, "tags");
        if let Err(e) = cache.pipe_zadd(&key, &trace_tags_lowercase).await {
            log::error!("Failed to add trace tags to autocomplete cache: {}", e);
        }

        if !trace_tags_originals.is_empty() {
            let original_key = autocomplete_original_key("traces", project_id, "tags");
            let field_values: Vec<(String, String)> = trace_tags_originals.into_iter().collect();
            if let Err(e) = cache.pipe_hset(&original_key, &field_values).await {
                log::error!(
                    "Failed to add trace tag originals to autocomplete cache: {}",
                    e
                );
            }
        }
    }

    // Store span models
    if !span_models_lowercase.is_empty() {
        let key = autocomplete_key("spans", project_id, "models");
        if let Err(e) = cache.pipe_zadd(&key, &span_models_lowercase).await {
            log::error!("Failed to add span models to autocomplete cache: {}", e);
        }

        if !span_models_originals.is_empty() {
            let original_key = autocomplete_original_key("spans", project_id, "models");
            let field_values: Vec<(String, String)> = span_models_originals.into_iter().collect();
            if let Err(e) = cache.pipe_hset(&original_key, &field_values).await {
                log::error!(
                    "Failed to add span model originals to autocomplete cache: {}",
                    e
                );
            }
        }
    }

    // Store trace models
    if !trace_models_lowercase.is_empty() {
        let key = autocomplete_key("traces", project_id, "models");
        if let Err(e) = cache.pipe_zadd(&key, &trace_models_lowercase).await {
            log::error!("Failed to add trace models to autocomplete cache: {}", e);
        }

        if !trace_models_originals.is_empty() {
            let original_key = autocomplete_original_key("traces", project_id, "models");
            let field_values: Vec<(String, String)> = trace_models_originals.into_iter().collect();
            if let Err(e) = cache.pipe_hset(&original_key, &field_values).await {
                log::error!(
                    "Failed to add trace model originals to autocomplete cache: {}",
                    e
                );
            }
        }
    }
}
