use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::SIGNAL_TRIGGERS_CACHE_KEY},
    db::{
        DB,
        signal_triggers::{SignalTrigger, get_signal_triggers},
    },
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
        Ok(Some(spans)) => Ok(spans),
        Ok(None) | Err(_) => {
            // Cache miss or error, fetch from database
            let spans: Vec<SignalTrigger> = get_signal_triggers(&db.pool, project_id).await?;

            // Store in cache (ignore cache write errors)
            if let Err(e) = cache
                .insert::<Vec<SignalTrigger>>(&cache_key, spans.clone())
                .await
            {
                log::error!(
                    "Failed to insert semantic event trigger spans into cache: {:?}, project_id={}",
                    e,
                    project_id
                );
            }

            Ok(spans)
        }
    }
}
