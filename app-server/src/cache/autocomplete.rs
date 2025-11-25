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

const AUTOCOMPLETE_FIELDS: [(&str, &str, &str); 8] = [
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

    let end_time = Utc::now();
    let start_time = end_time - Duration::days(BACKFILL_DAYS);

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

        for (resource, field, query) in AUTOCOMPLETE_FIELDS {
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

            let mut values = Vec::new();

            for row in result {
                if let Some(value) = row.get("value").and_then(|v| v.as_str()) {
                    if !value.is_empty() {
                        values.push(value.to_string());
                    }
                }
            }

            if values.is_empty() {
                continue;
            }

            let key = autocomplete_key(resource, project_id, field);

            for chunk in values.chunks(PIPELINE_BATCH_SIZE) {
                if let Err(e) = redis_cache.pipe_zadd(&key, chunk).await {
                    log::error!("Failed to pipeline insert into {}: {}", key, e);
                }
            }
        }
    }

    if let Err(e) = cache.insert(BACKFILL_SENTINEL_KEY, "1").await {
        log::error!("Failed to set backfill sentinel: {}", e);
    }

    Ok(())
}

pub async fn populate_autocomplete_cache(project_id: Uuid, spans: &[Span], cache: Arc<Cache>) {
    if spans.is_empty() {
        return;
    }

    for span in spans {
        let is_top_level = span.parent_span_id.is_none();

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
                    &autocomplete_key("traces", project_id, "names"),
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

            if is_top_level {
                let _ = cache
                    .zadd(
                        &autocomplete_key("traces", project_id, "tags"),
                        0.0,
                        &tag_str,
                    )
                    .await;
            }
        }

        let raw_attrs = &span.attributes.raw_attributes;

        if let Some(Value::String(model)) = raw_attrs.get(GEN_AI_REQUEST_MODEL) {
            let _ = cache
                .zadd(&autocomplete_key("spans", project_id, "models"), 0.0, model)
                .await;

            if is_top_level {
                let _ = cache
                    .zadd(
                        &autocomplete_key("traces", project_id, "models"),
                        0.0,
                        model,
                    )
                    .await;
            }
        }

        if let Some(Value::String(model)) = raw_attrs.get(GEN_AI_RESPONSE_MODEL) {
            let _ = cache
                .zadd(&autocomplete_key("spans", project_id, "models"), 0.0, model)
                .await;

            if is_top_level {
                let _ = cache
                    .zadd(
                        &autocomplete_key("traces", project_id, "models"),
                        0.0,
                        model,
                    )
                    .await;
            }
        }
    }
}
