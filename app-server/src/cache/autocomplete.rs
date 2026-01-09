use std::sync::Arc;

use anyhow::Result;
use chrono::{Duration, Utc};
use clickhouse::Row;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::cache::keys::{AUTOCOMPLETE_CACHE_KEY, AUTOCOMPLETE_LOCK_CACHE_KEY};
use crate::cache::{Cache, CacheTrait};
use crate::ch::utils::chrono_to_nanoseconds;
use crate::db::spans::Span;
use crate::traces::span_attributes::{GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL};

const BACKFILL_DAYS: i64 = 30;
const PIPELINE_BATCH_SIZE: usize = 256;

const AUTOCOMPLETE_CONFIG: &[(&str, &[&str])] = &[
    (
        "names",
        &[
            "SELECT arrayJoin(topK(512)(name)) as value FROM spans WHERE project_id = {project_id:UUID} AND start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND name != ''",
        ],
    ),
    (
        "top_span_names",
        &[
            "SELECT arrayJoin(topK(512)(name)) as value FROM spans WHERE project_id = {project_id:UUID} AND start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND empty(parent_span_id) AND name != ''",
        ],
    ),
    (
        "models",
        &[
            "SELECT arrayJoin(topK(256)(request_model)) as value FROM spans WHERE project_id = {project_id:UUID} AND start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND request_model != ''",
            "SELECT arrayJoin(topK(256)(response_model)) as value FROM spans WHERE project_id = {project_id:UUID} AND start_time >= {start_time:DateTime64(9)} AND start_time < {end_time:DateTime64(9)} AND response_model != ''",
        ],
    ),
    (
        "tags",
        &[
            "SELECT arrayJoin(topK(512)(name)) as value FROM tags WHERE project_id = {project_id:UUID} AND created_at >= {start_time:DateTime64(9)} AND created_at < {end_time:DateTime64(9)}",
        ],
    ),
];

#[derive(Row, Deserialize)]
pub struct AutocompleteValue {
    pub value: String,
}

pub fn get_autocomplete_key(resource: &str, project_id: Uuid, field: &str) -> String {
    format!(
        "{}:{}:{}:{}",
        AUTOCOMPLETE_CACHE_KEY, resource, project_id, field
    )
}

async fn prefill_autocomplete_key_if_missing(
    project_id: Uuid,
    key: &str,
    queries: &[&str],
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
) -> Result<()> {
    if queries.is_empty() {
        return Ok(());
    }

    let end_time = Utc::now();
    let start_time = end_time - Duration::days(BACKFILL_DAYS);

    let start_time_ns = chrono_to_nanoseconds(start_time);
    let end_time_ns = chrono_to_nanoseconds(end_time);

    let mut all_values = Vec::new();

    for query in queries {
        let results = clickhouse
            .query(query)
            .param("project_id", Value::String(project_id.to_string()))
            .param("start_time", Value::Number(start_time_ns.into()))
            .param("end_time", Value::Number(end_time_ns.into()))
            .fetch_all::<AutocompleteValue>()
            .await;

        if let Ok(rows) = results {
            for row in rows {
                all_values.push(row.value);
            }
        }
    }

    for chunk in all_values.chunks(PIPELINE_BATCH_SIZE) {
        if let Err(e) = cache.pipe_zadd(key, chunk).await {
            log::error!("Failed to prefill autocomplete key {}: {}", key, e);
        }
    }

    Ok(())
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

    let names_key = get_autocomplete_key("spans", project_id, "names");

    match cache.exists(&names_key).await {
        Ok(true) => {
            insert_current_span_values(project_id, spans, cache).await;
        }
        Ok(false) => {
            let lock_key = format!("{}:{}", AUTOCOMPLETE_LOCK_CACHE_KEY, project_id);

            match cache.try_acquire_lock(&lock_key, 60).await {
                Ok(true) => {
                    insert_current_span_values(project_id, spans, cache.clone()).await;

                    let cache_clone: Arc<Cache> = cache.clone();
                    let clickhouse_clone = clickhouse.clone();

                    tokio::spawn(async move {
                        for (field, queries) in AUTOCOMPLETE_CONFIG {
                            let key = get_autocomplete_key("spans", project_id, field);

                            if let Err(e) = prefill_autocomplete_key_if_missing(
                                project_id,
                                &key,
                                queries,
                                cache_clone.clone(),
                                clickhouse_clone.clone(),
                            )
                            .await
                            {
                                log::error!(
                                    "Cache autocomplete prefill failed for key {}: {:?}",
                                    key,
                                    e
                                );
                            }
                        }

                        if let Err(e) = cache_clone.release_lock(&lock_key).await {
                            log::error!(
                                "Failed to release prefill lock for project {}: {}",
                                project_id,
                                e
                            );
                        }
                    });
                }
                Ok(false) => {
                    insert_current_span_values(project_id, spans, cache).await;
                }
                Err(e) => {
                    log::error!("Failed to acquire lock for project {}: {}", project_id, e);
                }
            }
        }
        Err(e) => {
            log::error!("Failed to check existence of cachekey {}: {}", names_key, e);
        }
    }
}

async fn insert_current_span_values(project_id: Uuid, spans: &[Span], cache: Arc<Cache>) {
    for span in spans {
        let is_top_level = span.parent_span_id.is_none();

        let _ = cache
            .zadd(
                &get_autocomplete_key("spans", project_id, "names"),
                0.0,
                &span.name,
            )
            .await;

        if is_top_level {
            let _ = cache
                .zadd(
                    &get_autocomplete_key("spans", project_id, "top_span_names"),
                    0.0,
                    &span.name,
                )
                .await;
        }

        for tag in span.attributes.tags() {
            let tag_str = tag.to_string();
            let _ = cache
                .zadd(
                    &get_autocomplete_key("spans", project_id, "tags"),
                    0.0,
                    &tag_str,
                )
                .await;
        }

        let raw_attrs = &span.attributes.raw_attributes;

        if let Some(Value::String(model)) = raw_attrs.get(GEN_AI_REQUEST_MODEL) {
            let _ = cache
                .zadd(
                    &get_autocomplete_key("spans", project_id, "models"),
                    0.0,
                    model,
                )
                .await;
        }

        if let Some(Value::String(model)) = raw_attrs.get(GEN_AI_RESPONSE_MODEL) {
            let _ = cache
                .zadd(
                    &get_autocomplete_key("spans", project_id, "models"),
                    0.0,
                    model,
                )
                .await;
        }
    }
}
