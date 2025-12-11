use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::SEMANTIC_EVENT_TRIGGER_SPANS_CACHE_KEY},
    db::{
        DB,
        semantic_event_trigger_spans::{
            SemanticEventTriggerSpanWithDefinition,
            get_semantic_event_trigger_spans_with_definitions,
        },
    },
};

/// Get semantic event trigger spans for a project with read-through cache
pub async fn get_semantic_event_trigger_spans_cached(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<Vec<SemanticEventTriggerSpanWithDefinition>> {
    let cache_key = format!("{}:{}", SEMANTIC_EVENT_TRIGGER_SPANS_CACHE_KEY, project_id);

    // Try to get from cache first
    let cache_res = cache
        .get::<Vec<SemanticEventTriggerSpanWithDefinition>>(&cache_key)
        .await;

    match cache_res {
        Ok(Some(spans)) => Ok(spans),
        Ok(None) | Err(_) => {
            // Cache miss or error, fetch from database
            let spans =
                get_semantic_event_trigger_spans_with_definitions(&db.pool, project_id).await?;

            // Store in cache (ignore cache write errors)
            if let Err(e) = cache
                .insert::<Vec<SemanticEventTriggerSpanWithDefinition>>(&cache_key, spans.clone())
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
