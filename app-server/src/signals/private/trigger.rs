use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::SIGNAL_TRIGGERS_CACHE_KEY},
    db::DB,
    signals::private::db::signal_triggers::{SignalTrigger, get_signal_triggers},
};

/// Get signal triggers for a project with read-through cache
pub async fn get_signal_triggers_cached(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<Vec<SignalTrigger>> {
    let cache_key = format!("{}:{}", SIGNAL_TRIGGERS_CACHE_KEY, project_id);

    // Try to get from cache first
    let cache_res = cache.get::<Vec<SignalTrigger>>(&cache_key).await;

    match cache_res {
        Ok(Some(triggers)) => Ok(triggers),
        Ok(None) | Err(_) => {
            // Cache miss or error, fetch from database
            let triggers: Vec<SignalTrigger> = get_signal_triggers(&db.pool, project_id).await?;

            // Store in cache (ignore cache write errors)
            if let Err(e) = cache
                .insert::<Vec<SignalTrigger>>(&cache_key, triggers.clone())
                .await
            {
                log::error!(
                    "Failed to insert signal triggers into cache: {:?}, project_id={}",
                    e,
                    project_id
                );
            }

            Ok(triggers)
        }
    }
}
