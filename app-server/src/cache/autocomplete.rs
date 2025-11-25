use std::collections::HashSet;
use std::sync::Arc;

use anyhow::Result;
use chrono::{Duration, Utc};
use serde_json::Value;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait};
use crate::db::spans::Span;
use crate::traces::span_attributes::{GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL};

const BACKFILL_DAYS: i64 = 30;
const PIPELINE_BATCH_SIZE: usize = 500;

pub fn autocomplete_key(resource: &str, project_id: Uuid, field: &str) -> String {
    format!("autocomplete:{}:{}:{}", resource, project_id, field)
}

fn get_autocomplete_queries(field: &str) -> &'static [&'static str] {
    match field {
        "names" => &[
            "SELECT DISTINCT name as value FROM spans WHERE project_id = {project_id:UUID} AND start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND name != ''",
        ],
        "top_span_names" => &[
            "SELECT DISTINCT name as value FROM spans WHERE project_id = {project_id:UUID} AND start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND parent_span_id = '00000000-0000-0000-0000-000000000000' AND name != ''",
        ],
        "models" => &[
            "SELECT DISTINCT request_model as value FROM spans WHERE project_id = {project_id:UUID} AND start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND request_model != ''",
            "SELECT DISTINCT response_model as value FROM spans WHERE project_id = {project_id:UUID} AND start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND response_model != ''",
        ],
        "tags" => &[
            "SELECT DISTINCT name as value FROM tags WHERE project_id = {project_id:UUID} AND created_at >= {start_time:DateTime64(9)} AND created_at < {end_time:DateTime64(9)}",
        ],
        _ => &[],
    }
}

async fn prefill_autocomplete_key_if_missing(
    field: &str,
    project_id: Uuid,
    key: &str,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
) -> Result<()> {
    let redis_cache = match cache.as_ref() {
        Cache::Redis(_) => cache,
        _ => return Ok(()),
    };

    let end_time = Utc::now();
    let start_time = end_time - Duration::days(BACKFILL_DAYS);

    let matching_queries = get_autocomplete_queries(field);

    if matching_queries.is_empty() {
        return Ok(());
    }

    let start_time_str = start_time
        .naive_utc()
        .format("%Y-%m-%d %H:%M:%S%.9f")
        .to_string();
    let end_time_str = end_time
        .naive_utc()
        .format("%Y-%m-%d %H:%M:%S%.9f")
        .to_string();

    let mut all_values = Vec::new();

    for query in matching_queries {
        let clickhouse_query = clickhouse
            .query(query)
            .with_option("default_format", "JSON")
            .with_option("output_format_json_quote_64bit_integers", "0")
            .param("project_id", Value::String(project_id.to_string()))
            .param("start_time", Value::String(start_time_str.clone()))
            .param("end_time", Value::String(end_time_str.clone()));

        let fetch_result = clickhouse_query.fetch_bytes("JSON");

        if let Ok(mut rows) = fetch_result {
            if let Ok(data) = rows.collect().await {
                if let Ok(results) = serde_json::from_slice::<Value>(&data) {
                    if let Some(result) = results.get("data").and_then(|d| d.as_array()) {
                        for row in result {
                            if let Some(value) = row.get("value").and_then(|v| v.as_str()) {
                                if !value.is_empty() {
                                    all_values.push(value.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if !all_values.is_empty() {
        let redis_cache = match redis_cache.as_ref() {
            Cache::Redis(r) => r,
            _ => return Ok(()),
        };

        for chunk in all_values.chunks(PIPELINE_BATCH_SIZE) {
            if let Err(e) = redis_cache.pipe_zadd(key, chunk).await {
                log::error!("Failed to prefill autocomplete key {}: {}", key, e);
            }
        }
    }

    Ok(())
}

async fn insert_current_span_values(project_id: Uuid, spans: &[Span], cache: Arc<Cache>) {
    for span in spans {
        let is_top_level = span.parent_span_id.is_none();

        // Insert span name
        let _ = cache
            .zadd(
                &autocomplete_key("spans", project_id, "names"),
                0.0,
                &span.name,
            )
            .await;

        if is_top_level {
            let _ = cache
                .zadd(
                    &autocomplete_key("spans", project_id, "top_span_names"),
                    0.0,
                    &span.name,
                )
                .await;
        }

        for tag in span.attributes.tags() {
            let tag_str = tag.to_string();
            let _ = cache
                .zadd(
                    &autocomplete_key("spans", project_id, "tags"),
                    0.0,
                    &tag_str,
                )
                .await;
        }

        let raw_attrs = &span.attributes.raw_attributes;

        if let Some(Value::String(model)) = raw_attrs.get(GEN_AI_REQUEST_MODEL) {
            let _ = cache
                .zadd(&autocomplete_key("spans", project_id, "models"), 0.0, model)
                .await;
        }

        if let Some(Value::String(model)) = raw_attrs.get(GEN_AI_RESPONSE_MODEL) {
            let _ = cache
                .zadd(&autocomplete_key("spans", project_id, "models"), 0.0, model)
                .await;
        }
    }
}

pub async fn populate_autocomplete_cache(
    project_id: Uuid,
    spans: &[Span],
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
) {
    if spans.is_empty() {
        return;
    }

    let mut keys_to_check = HashSet::<&str>::new();

    for span in spans {
        let is_top_level = span.parent_span_id.is_none();

        keys_to_check.insert("names");
        if is_top_level {
            keys_to_check.insert("top_span_names");
        }

        if !span.attributes.tags().is_empty() {
            keys_to_check.insert("tags");
        }

        let raw_attrs = &span.attributes.raw_attributes;
        if raw_attrs.contains_key(GEN_AI_REQUEST_MODEL)
            || raw_attrs.contains_key(GEN_AI_RESPONSE_MODEL)
        {
            keys_to_check.insert("models");
        }
    }

    for field in keys_to_check {
        let key = autocomplete_key("spans", project_id, field);

        match cache.exists(&key).await {
            Ok(false) => {
                let cache_clone = cache.clone();
                let clickhouse_clone = clickhouse.clone();
                let key_clone = key.clone();

                tokio::spawn(async move {
                    if let Err(e) = prefill_autocomplete_key_if_missing(
                        field,
                        project_id,
                        &key_clone,
                        cache_clone,
                        clickhouse_clone,
                    )
                    .await
                    {
                        log::error!(
                            "Cache autocomplete prefill failed for key {}: {:?}",
                            key_clone,
                            e
                        );
                    }
                });
            }
            Err(e) => {
                log::error!("Failed to check existence of key {}: {}", key, e);
            }
            _ => {}
        }
    }

    insert_current_span_values(project_id, spans, cache).await;
}
