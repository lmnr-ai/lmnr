//! Consumer for the static-prompt queue.
//!
//! Accumulates raw system prompts per naive signature until enough samples
//! exist, then runs the extraction agent once (under a per-signature lock)
//! and caches the produced regex list.

use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{accumulator_cache_key, agent, extraction_lock_cache_key, static_regex_cache_key};
use crate::{
    cache::{Cache, CacheTrait},
    worker::{HandlerError, MessageHandler},
};

/// Number of same-signature system prompts to accumulate before triggering
/// the extraction agent. More samples let the agent tell static text from
/// dynamic fragments reliably.
const MIN_PROMPT_SAMPLES: usize = 5;

/// TTL on the per-signature extraction lock: long enough for the agent to
/// produce a regex list, short enough that a failed run frees the signature
/// promptly for a retry.
const EXTRACTION_LOCK_TTL_SECONDS: u64 = 5 * 60;

/// TTL on the accumulated raw prompts, so signatures that never reach
/// `MIN_PROMPT_SAMPLES` don't hold onto prompt bodies forever.
const ACCUMULATOR_TTL_SECONDS: u64 = 24 * 3600;

const STATIC_REGEX_TTL_SECONDS: u64 = 7 * 24 * 3600;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticPromptQueueMessage {
    pub project_id: Uuid,
    /// Naive signature (`lmnr.span.prompt_hash`) shared by all runs of the
    /// same agent.
    pub prompt_hash: String,
    pub system_prompt: String,
}

pub struct StaticPromptHandler {
    pub cache: Arc<Cache>,
}

#[async_trait]
impl MessageHandler for StaticPromptHandler {
    type Message = Vec<StaticPromptQueueMessage>;

    async fn handle(&self, messages: Self::Message) -> Result<(), HandlerError> {
        for message in &messages {
            // Per-message best effort: one bad prompt must not poison the
            // batch, and dropped work re-triggers on a later span anyway.
            if let Err(e) = self.process_prompt(message).await {
                log::error!(
                    "[STATIC_PROMPT] Failed to process prompt for signature {}: {e:?}",
                    message.prompt_hash
                );
            }
        }
        Ok(())
    }
}

impl StaticPromptHandler {
    async fn process_prompt(&self, message: &StaticPromptQueueMessage) -> anyhow::Result<()> {
        let regex_key = static_regex_cache_key(message.project_id, &message.prompt_hash);

        // The producer checked too, but the regex may have landed while this
        // message sat in the queue.
        if self.cache.exists(&regex_key).await.unwrap_or(false) {
            return Ok(());
        }

        let samples = self.accumulate_prompt(message).await?;
        if samples.len() < MIN_PROMPT_SAMPLES {
            return Ok(());
        }

        // One extraction per signature: whoever holds the lock runs the agent;
        // everyone else drops their span — the regex for this signature is
        // already being produced.
        let lock_key = extraction_lock_cache_key(message.project_id, &message.prompt_hash);
        let acquired = self
            .cache
            .try_acquire_lock(&lock_key, EXTRACTION_LOCK_TTL_SECONDS)
            .await
            .unwrap_or_else(|e| {
                log::warn!("[STATIC_PROMPT] Failed to acquire lock {lock_key}: {e:?}");
                false
            });
        if !acquired {
            return Ok(());
        }

        // On failure the lock is deliberately NOT released: it expires after
        // TTL, which both rate-limits retries against a failing agent and
        // guarantees the signature eventually unblocks.
        let regexes = agent::generate_static_part_regexes(&samples).await?;

        self.cache
            .insert_with_ttl(&regex_key, &regexes, STATIC_REGEX_TTL_SECONDS)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to write regex cache {regex_key}: {e:?}"))?;

        // Raw samples are no longer needed once the regex list exists.
        let accumulator_key = accumulator_cache_key(message.project_id, &message.prompt_hash);
        if let Err(e) = self.cache.remove(&accumulator_key).await {
            log::warn!("[STATIC_PROMPT] Failed to clear accumulator {accumulator_key}: {e:?}");
        }

        if let Err(e) = self.cache.release_lock(&lock_key).await {
            log::warn!("[STATIC_PROMPT] Failed to release lock {lock_key}: {e:?}");
        }

        Ok(())
    }

    /// Append the prompt to the signature's sample list and return the
    /// updated list.
    async fn accumulate_prompt(
        &self,
        message: &StaticPromptQueueMessage,
    ) -> anyhow::Result<Vec<String>> {
        let key = accumulator_cache_key(message.project_id, &message.prompt_hash);
        let mut samples = self
            .cache
            .get::<Vec<String>>(&key)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to read accumulator {key}: {e:?}"))?
            .unwrap_or_default();

        samples.push(message.system_prompt.clone());

        self.cache
            .insert_with_ttl(&key, &samples, ACCUMULATOR_TTL_SECONDS)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to write accumulator {key}: {e:?}"))?;

        Ok(samples)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    fn make_handler() -> StaticPromptHandler {
        StaticPromptHandler {
            cache: Arc::new(Cache::InMemory(InMemoryCache::new(None))),
        }
    }

    fn make_message(project_id: Uuid, prompt: &str) -> StaticPromptQueueMessage {
        StaticPromptQueueMessage {
            project_id,
            prompt_hash: "abcd1234".to_string(),
            system_prompt: prompt.to_string(),
        }
    }

    #[tokio::test]
    async fn accumulates_until_threshold_then_writes_regex_cache() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let regex_key = static_regex_cache_key(project_id, "abcd1234");
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");

        for i in 0..MIN_PROMPT_SAMPLES - 1 {
            handler
                .process_prompt(&make_message(project_id, &format!("prompt {i}")))
                .await
                .unwrap();
            assert!(!handler.cache.exists(&regex_key).await.unwrap());
        }

        let samples = handler
            .cache
            .get::<Vec<String>>(&accumulator_key)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(samples.len(), MIN_PROMPT_SAMPLES - 1);

        handler
            .process_prompt(&make_message(project_id, "prompt 4"))
            .await
            .unwrap();

        assert!(handler.cache.exists(&regex_key).await.unwrap());
        // Accumulator is cleared once the regex list is produced.
        assert!(!handler.cache.exists(&accumulator_key).await.unwrap());
    }

    #[tokio::test]
    async fn skips_when_regex_already_cached() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let regex_key = static_regex_cache_key(project_id, "abcd1234");
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");

        handler
            .cache
            .insert::<Vec<String>>(&regex_key, vec![r"\d+".to_string()])
            .await
            .unwrap();

        handler
            .process_prompt(&make_message(project_id, "prompt"))
            .await
            .unwrap();

        assert!(!handler.cache.exists(&accumulator_key).await.unwrap());
    }

    #[tokio::test]
    async fn drops_when_extraction_lock_held() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let regex_key = static_regex_cache_key(project_id, "abcd1234");
        let lock_key = extraction_lock_cache_key(project_id, "abcd1234");

        for i in 0..MIN_PROMPT_SAMPLES - 1 {
            handler
                .process_prompt(&make_message(project_id, &format!("prompt {i}")))
                .await
                .unwrap();
        }

        // Another worker is already producing the regex for this signature.
        assert!(
            handler
                .cache
                .try_acquire_lock(&lock_key, EXTRACTION_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );

        handler
            .process_prompt(&make_message(project_id, "prompt 4"))
            .await
            .unwrap();

        assert!(!handler.cache.exists(&regex_key).await.unwrap());
    }
}
