//! Trace→session hint, the one producer-side Redis write in the dedup path.
//!
//! A span's dedup group is its session when it has one, else its trace. Within
//! one trace some spans carry the session and some don't, so without help the
//! same conversation would be split across two groups. Every span that carries
//! a session publishes `trace_session:{project}:{trace} → session`; an LLM span
//! without one adopts the hinted session and gets it stamped into its
//! attributes, so `spans.session_id` — the read side's group source — matches
//! the key the content was stored under.
//!
//! Locality-only: a missing or expired hint just falls back to the trace group,
//! and the read side resolves either.

use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::TRACE_SESSION_HINT_CACHE_KEY},
    db::spans::Span,
    traces::span_attributes::ASSOCIATION_PROPERTIES_PREFIX,
};

/// Longer than the dedup seen-keys: a hint that outlives them only keeps a
/// long-running trace's late spans in the right group.
const TRACE_SESSION_HINT_TTL_SECONDS: u64 = 6 * 3600;

fn hint_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!(
        "{TRACE_SESSION_HINT_CACHE_KEY}:{}:{}",
        project_id.simple(),
        trace_id.simple()
    )
}

/// Settle the session the span's dedup group derives from. Must run before any
/// dedup verdict is built for the span.
pub async fn resolve_session(span: &mut Span, cache: &Cache) {
    let key = hint_key(span.project_id, span.trace_id);
    if let Some(session_id) = span.attributes.session_id() {
        let _ = cache
            .insert_with_ttl(&key, session_id, TRACE_SESSION_HINT_TTL_SECONDS)
            .await;
        return;
    }
    // Only LLM spans have deduped content, so only they need the group.
    if !span.is_llm_span() {
        return;
    }
    if let Ok(Some(session_id)) = cache.get::<String>(&key).await {
        span.attributes.raw_attributes.insert(
            format!("{ASSOCIATION_PROPERTIES_PREFIX}.session_id"),
            Value::String(session_id),
        );
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, sync::Arc};

    use serde_json::json;

    use super::*;
    use crate::{
        cache::in_memory::InMemoryCache, db::spans::SpanType, traces::spans::SpanAttributes,
    };

    fn make_cache() -> Arc<Cache> {
        Arc::new(Cache::InMemory(InMemoryCache::new(None)))
    }

    #[tokio::test]
    async fn session_span_publishes_hint_and_later_llm_span_adopts_it() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();

        let mut with_session = Span {
            project_id,
            trace_id,
            attributes: SpanAttributes::new(HashMap::from([(
                format!("{ASSOCIATION_PROPERTIES_PREFIX}.session_id"),
                json!("sess-1"),
            )])),
            ..Default::default()
        };
        resolve_session(&mut with_session, &cache).await;

        let mut llm = Span {
            span_type: SpanType::LLM,
            project_id,
            trace_id,
            ..Default::default()
        };
        resolve_session(&mut llm, &cache).await;
        assert_eq!(llm.attributes.session_id().as_deref(), Some("sess-1"));
        assert_eq!(super::super::span_group_id(&llm), "sess-1");
    }

    #[tokio::test]
    async fn non_llm_span_without_session_is_left_alone() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        cache
            .insert_with_ttl(&hint_key(project_id, trace_id), "sess-1", 60)
            .await
            .unwrap();

        let mut span = Span {
            project_id,
            trace_id,
            ..Default::default()
        };
        resolve_session(&mut span, &cache).await;
        assert!(span.attributes.session_id().is_none());
        assert_eq!(super::super::span_group_id(&span), trace_id.to_string());
    }

    #[tokio::test]
    async fn own_session_wins_over_hint() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        cache
            .insert_with_ttl(&hint_key(project_id, trace_id), "stale", 60)
            .await
            .unwrap();

        let mut span = Span {
            span_type: SpanType::LLM,
            project_id,
            trace_id,
            attributes: SpanAttributes::new(HashMap::from([(
                "ai.telemetry.metadata.sessionId".to_string(),
                json!("own"),
            )])),
            ..Default::default()
        };
        resolve_session(&mut span, &cache).await;
        assert_eq!(span.attributes.session_id().as_deref(), Some("own"));
        let hinted: Option<String> = cache.get(&hint_key(project_id, trace_id)).await.unwrap();
        assert_eq!(hinted.as_deref(), Some("own"));
    }
}
