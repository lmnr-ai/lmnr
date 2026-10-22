//! Ingestion side: every LLM span with a system prompt becomes an
//! [`AgentCall`], published once per batch after the spans themselves.
//!
//! A call carries the hashes of its document's lines, and their text only the
//! first time its document is seen, so repeated calls cost a few bytes per
//! line.

use std::{collections::HashSet, sync::LazyLock};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{AGENT_VERSIONING_EXCHANGE, AGENT_VERSIONING_ROUTING_KEY, document};
use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_VERSIONING_DOC_CACHE_KEY},
    features::{Feature, is_feature_enabled},
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
};

/// Where the job traces its own LLM calls; its spans are never versioned.
static INTERNAL_PROJECT_ID: LazyLock<Option<Uuid>> = LazyLock::new(|| {
    std::env::var(crate::env::connections::AGENT_VERSIONING_INTERNAL_PROJECT_ID)
        .ok()
        .and_then(|s| Uuid::parse_str(&s).ok())
});

pub fn internal_project_id() -> Option<Uuid> {
    *INTERNAL_PROJECT_ID
}

/// Whether the project's spans become agent calls.
pub fn records_calls(project_id: Uuid) -> bool {
    is_feature_enabled(Feature::AgentVersioning) && internal_project_id() != Some(project_id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCall {
    pub project_id: Uuid,
    pub agent_hash: String,
    pub trace_id: Uuid,
    pub span_id: Uuid,
    pub start_time: DateTime<Utc>,
    /// [`document::line_hash`] of each line, in document order.
    pub line_hashes: Vec<u64>,
    /// The text of each line, aligned with `line_hashes`. `None` once the
    /// document's texts are stored.
    pub lines: Option<Vec<String>>,
}

impl AgentCall {
    pub fn new(
        project_id: Uuid,
        agent_hash: String,
        trace_id: Uuid,
        span_id: Uuid,
        start_time: DateTime<Utc>,
        lines: Vec<String>,
    ) -> Self {
        Self {
            project_id,
            agent_hash,
            trace_id,
            span_id,
            start_time,
            line_hashes: lines.iter().map(|line| document::line_hash(line)).collect(),
            lines: Some(lines),
        }
    }

    /// Set once the document's line texts are stored.
    pub fn doc_cache_key(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        for hash in &self.line_hashes {
            hasher.update(&hash.to_le_bytes());
        }
        let doc_hash = hasher.finalize().to_hex();
        format!(
            "{AGENT_VERSIONING_DOC_CACHE_KEY}:{}:{}:{}",
            self.project_id,
            self.agent_hash,
            &doc_hash[..32]
        )
    }
}

/// Best-effort: a lost call only thins its agent's traces, so failures are
/// logged and never fail ingestion.
pub async fn publish_agent_calls(mut calls: Vec<AgentCall>, cache: &Cache, queue: &MessageQueue) {
    if calls.is_empty() {
        return;
    }
    strip_known_lines(&mut calls, cache).await;

    let payload = match serde_json::to_vec(&calls) {
        Ok(payload) => payload,
        Err(e) => {
            log::error!("[AGENT_VERSIONING] Failed to serialize agent calls: {e:?}");
            return;
        }
    };
    if payload.len() < mq_max_payload() {
        publish(queue, &payload).await;
        return;
    }
    // Large documents shipping their text for the first time; one by one.
    for call in calls {
        let payload = match serde_json::to_vec(&[&call]) {
            Ok(payload) => payload,
            Err(e) => {
                log::error!("[AGENT_VERSIONING] Failed to serialize agent call: {e:?}");
                continue;
            }
        };
        if payload.len() >= mq_max_payload() {
            log::warn!(
                "[AGENT_VERSIONING] Agent call exceeds the MQ payload limit. Project ID: [{}], span ID: [{}], size: [{}]",
                call.project_id,
                call.span_id,
                payload.len()
            );
            continue;
        }
        publish(queue, &payload).await;
    }
}

/// Drops the texts of documents already stored or already shipped earlier in
/// the batch.
async fn strip_known_lines(calls: &mut [AgentCall], cache: &Cache) {
    let mut shipped = HashSet::new();
    for call in calls {
        let key = call.doc_cache_key();
        let known = shipped.contains(&key)
            || match cache.exists(&key).await {
                Ok(exists) => exists,
                Err(e) => {
                    log::warn!("[AGENT_VERSIONING] Failed to check document cache: {e:?}");
                    false
                }
            };
        if known {
            call.lines = None;
        } else {
            shipped.insert(key);
        }
    }
}

async fn publish(queue: &MessageQueue, payload: &[u8]) {
    if let Err(e) = queue
        .publish(
            payload,
            AGENT_VERSIONING_EXCHANGE,
            AGENT_VERSIONING_ROUTING_KEY,
            None,
        )
        .await
    {
        log::error!("[AGENT_VERSIONING] Failed to publish agent calls: {e:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(lines: &[&str]) -> AgentCall {
        AgentCall::new(
            Uuid::nil(),
            "agent".to_string(),
            Uuid::nil(),
            Uuid::nil(),
            Utc::now(),
            lines.iter().map(|line| line.to_string()).collect(),
        )
    }

    #[test]
    fn doc_key_ignores_masked_values() {
        let a = call(&["You are a bot.", "Today is 2026-10-01."]);
        let b = call(&["You are a bot.", "Today is 2026-10-02."]);
        assert_eq!(a.doc_cache_key(), b.doc_cache_key());
    }

    #[test]
    fn doc_key_depends_on_line_order() {
        let a = call(&["One rule.", "Another rule."]);
        let b = call(&["Another rule.", "One rule."]);
        assert_ne!(a.doc_cache_key(), b.doc_cache_key());
    }
}
