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
    let cached_names = cache.get::<Vec<String>>(&cache_key).await;
    match cached_names {
        Ok(Some(cached_names)) => {
            let cached_names_set = HashSet::<String>::from_iter(cached_names);
            let names_set = HashSet::from_iter(names);
            if cached_names_set.is_superset(&names_set) {
                return Ok(());
            }
            let new_names = cached_names_set
                .union(&names_set)
                .cloned()
                .collect::<Vec<String>>();
            // Found in cache, but this event name is new, insert it into the database and cache
            db::event_definitions::insert_event_definition_names(&db.pool, project_id, &new_names)
                .await?;
            cache.insert(&cache_key, new_names).await?;
            Ok(())
        }
        Err(_) | Ok(None) => {
            // Not found in cache, insert it into the database, update the cache
            db::event_definitions::insert_event_definition_names(&db.pool, project_id, &names)
                .await?;
            let new_names =
                db::event_definitions::get_event_definition_names(&db.pool, project_id).await?;
            cache.insert(&cache_key, new_names).await?;
            Ok(())
        }
    }
}
