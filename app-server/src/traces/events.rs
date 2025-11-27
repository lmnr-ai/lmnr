use std::collections::HashSet;
use std::sync::Arc;

use anyhow::Result;
use tracing::instrument;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::PROJECT_EVENT_NAMES_CACHE_KEY},
    ch::{self, events::CHEvent},
    db::{self, DB, events::Event},
};

const EVENT_DEFINITION_NAME_CACHE_TTL: u64 = 60 * 60 * 24 * 7; // 7 days

#[instrument(skip(cache, db, project_id, clickhouse, event_payloads))]
pub async fn record_events(
    cache: Arc<Cache>,
    db: Arc<DB>,
    project_id: Uuid,
    clickhouse: clickhouse::Client,
    event_payloads: &Vec<Event>,
) -> Result<usize> {
    let ch_events = event_payloads
        .iter()
        .map(|e| CHEvent::from_db_event(e))
        .collect::<Vec<CHEvent>>();
    let event_names = ch_events
        .iter()
        .map(|e| e.name.clone())
        .collect::<Vec<String>>();
    tokio::spawn(async move {
        let _ = insert_event_definition_names(db.clone(), cache.clone(), &project_id, event_names)
            .await
            .map_err(|e| log::error!("Failed to insert event definition names: {:?}", e));
    });
    ch::events::insert_events(clickhouse, ch_events).await
}

async fn insert_event_definition_names(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: &Uuid,
    names: Vec<String>,
) -> Result<()> {
    let cache_key = format!("{PROJECT_EVENT_NAMES_CACHE_KEY}:{}", project_id);
    let unique_names = names.into_iter().collect::<HashSet<String>>();

    // Spawn parallel tasks for cache lookups
    let mut tasks = Vec::new();
    for name in unique_names {
        let cache_clone = cache.clone();
        let cache_key_clone = cache_key.clone();
        let task = tokio::spawn(async move {
            let result = cache_clone
                .get::<bool>(&format!("{cache_key_clone}:{}", name))
                .await;
            (name, result)
        });
        tasks.push(task);
    }

    // Join all tasks and collect new names
    let mut new_names = Vec::new();
    for task in tasks {
        match task.await {
            Ok((name, result)) => match result {
                Ok(Some(false)) | Ok(None) => {
                    new_names.push(name);
                }
                Ok(Some(true)) => {}
                Err(_) => {
                    log::error!("Failed to get event definition name from cache: {:?}", name);
                    new_names.push(name);
                }
            },
            Err(e) => {
                log::error!("Task failed to complete: {:?}", e);
            }
        }
    }

    if new_names.is_empty() {
        return Ok(());
    }

    db::event_definitions::insert_event_definition_names(&db.pool, project_id, &new_names).await?;
    for name in new_names {
        cache
            .insert_with_ttl(
                &format!("{cache_key}:{}", name),
                true,
                EVENT_DEFINITION_NAME_CACHE_TTL,
            )
            .await?;
    }
    Ok(())
}
