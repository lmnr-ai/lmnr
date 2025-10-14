use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::SUMMARY_TRIGGER_SPANS_CACHE_KEY},
    db::{
        DB,
        summary_trigger_spans::{
            EventDefinition, SummaryTriggerSpanWithEvent, get_summary_trigger_spans_with_events,
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

/// Check if a span name matches any trigger and return the associated semantic event definitions
/// Returns None if span doesn't match any trigger, or Some(Vec<EventDefinition>) if it does
/// (the Vec can be empty if trigger exists but has no event definitions)
pub fn check_span_trigger(
    span_name: &str,
    trigger_spans: &[SummaryTriggerSpanWithEvent],
) -> Option<Vec<EventDefinition>> {
    let matching_triggers: Vec<_> = trigger_spans
        .iter()
        .filter(|trigger| trigger.span_name == span_name)
        .collect();

    if matching_triggers.is_empty() {
        None
    } else {
        Some(
            matching_triggers
                .into_iter()
                .filter_map(|trigger| trigger.event_definition.clone())
                .collect(),
        )
    }
}
