use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::SUMMARY_TRIGGER_SPANS_CACHE_KEY},
    db::{
        DB,
        summary_trigger_spans::{
            SummaryTriggerSpanWithEvent, get_summary_trigger_spans_with_events,
        },
    },
};

/// Get summary trigger spans for a project with read-through cache
pub async fn get_summary_trigger_spans_cached(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<Vec<SummaryTriggerSpanWithEvent>> {
    let cache_key = format!("{}:{}", SUMMARY_TRIGGER_SPANS_CACHE_KEY, project_id);

    // Try to get from cache first
    let cache_res = cache
        .get::<Vec<SummaryTriggerSpanWithEvent>>(&cache_key)
        .await;

    match cache_res {
        Ok(Some(spans)) => Ok(spans),
        Ok(None) | Err(_) => {
            // Cache miss or error, fetch from database
            let spans = get_summary_trigger_spans_with_events(&db.pool, project_id).await?;

            // Store in cache (ignore cache write errors)
            if let Err(e) = cache
                .insert::<Vec<SummaryTriggerSpanWithEvent>>(&cache_key, spans.clone())
                .await
            {
                log::error!(
                    "Failed to insert summary trigger spans into cache: {:?}, project_id={}",
                    e,
                    project_id
                );
            }

            Ok(spans)
        }
    }
}

/// Check if a span name matches any trigger and return all matching trigger configurations
/// Returns a vector of matching triggers (can be empty if no match)
pub fn check_span_trigger(
    span_name: &str,
    trigger_spans: &[SummaryTriggerSpanWithEvent],
) -> Vec<SummaryTriggerSpanWithEvent> {
    trigger_spans
        .iter()
        .filter(|trigger| trigger.span_name == span_name)
        .cloned()
        .collect()
}
