//! Consumer for the static-prompt queue.
//!
//! Accumulates raw system prompts per naive signature until enough samples
//! exist, then runs the extraction agent once (under a per-signature lock)
//! and caches the produced regex list.

use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    ExtractionConfig, ExtractionTracing, accumulator_cache_key, extract_static_regexes,
    extraction_lock_cache_key, static_regex_cache_key,
};
use crate::{
    cache::{Cache, CacheTrait},
    llm::LlmClient,
    worker::{HandlerError, MessageHandler},
};

/// Number of same-signature system prompts to accumulate before triggering
/// the extraction agent. More samples let the agent tell static text from
/// dynamic fragments reliably.
const MIN_PROMPT_SAMPLES: usize = 5;

/// Cap on accumulated samples. When the agent fails persistently, the lock
/// TTL rate-limits extraction while messages keep arriving — without a cap
/// the sample list (large system prompts) would grow the cache value
/// unboundedly.
const MAX_PROMPT_SAMPLES: usize = 10;

/// TTL on the per-signature extraction lock: long enough for the agent to
/// produce a regex list (normally under 10 min; the per-step upper bounds
/// are high just in case, so leave generous headroom), short enough that a
/// failed run frees the signature reasonably promptly for a retry.
const EXTRACTION_LOCK_TTL_SECONDS: u64 = 30 * 60;

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
    /// `None` when the Signals feature is disabled or LLM initialization
    /// failed; the handler then drains the queue without extracting.
    pub llm_client: Option<Arc<LlmClient>>,
    /// Test seam replacing the extraction agent: `Some(regexes)` is returned
    /// as the agent's answer (empty = simulated agent failure).
    #[cfg(test)]
    pub test_regexes: Option<Vec<String>>,
}

impl StaticPromptHandler {
    pub fn new(cache: Arc<Cache>, llm_client: Option<Arc<LlmClient>>) -> Self {
        Self {
            cache,
            llm_client,
            #[cfg(test)]
            test_regexes: None,
        }
    }

    fn extraction_available(&self) -> bool {
        #[cfg(test)]
        if self.test_regexes.is_some() {
            return true;
        }
        self.llm_client.is_some()
    }

    /// Destination project for the extraction run's internal self-tracing
    /// spans. Unset/unparsable ⇒ `None` ⇒ the spans are dropped by the
    /// internal exporter (tracing effectively off). `mod env` shadows
    /// `std::env`, hence the fully-qualified read.
    fn internal_project_id() -> Option<Uuid> {
        std::env::var(crate::env::connections::STATIC_PROMPT_INTERNAL_PROJECT_ID)
            .ok()
            .and_then(|s| s.parse().ok())
    }

    /// Run the extraction agent on the accumulated samples. The agent itself
    /// never errors — an empty regex list means every attempt failed, which
    /// is surfaced as an error so the caller keeps the extraction lock held
    /// (its TTL then rate-limits retries).
    async fn run_extraction(&self, samples: &[String]) -> anyhow::Result<Vec<String>> {
        #[cfg(test)]
        if let Some(regexes) = &self.test_regexes {
            if regexes.is_empty() {
                anyhow::bail!("Simulated extraction failure");
            }
            return Ok(regexes.clone());
        }

        let Some(llm_client) = &self.llm_client else {
            anyhow::bail!("LLM client not configured");
        };
        let result = extract_static_regexes(
            llm_client,
            samples,
            &ExtractionConfig::default(),
            &ExtractionTracing {
                project_id: Self::internal_project_id(),
                parent: None,
            },
        )
        .await;
        if result.regexes.is_empty() {
            anyhow::bail!(
                "Extraction agent produced no regexes after {} tool calls",
                result.tool_calls
            );
        }
        Ok(result.regexes)
    }
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
        // Without an LLM client extraction can never run — drain the queue
        // without accumulating prompt bodies.
        if !self.extraction_available() {
            return Ok(());
        }

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

        // Double-check under the lock: another worker may have completed
        // (written the regex and released the lock) between the check above
        // and the acquisition — don't burn an agent run on a signature that
        // already has its regex list.
        if self.cache.exists(&regex_key).await.unwrap_or(false) {
            if let Err(e) = self.cache.release_lock(&lock_key).await {
                log::warn!("[STATIC_PROMPT] Failed to release lock {lock_key}: {e:?}");
            }
            return Ok(());
        }

        // On agent failure the lock is deliberately NOT released: it expires
        // after TTL, which both rate-limits retries against a failing agent
        // and guarantees the signature eventually unblocks.
        let regexes = self.run_extraction(&samples).await?;

        if let Err(e) = self
            .cache
            .insert_with_ttl(&regex_key, &regexes, STATIC_REGEX_TTL_SECONDS)
            .await
        {
            // The agent already succeeded — release the lock so a later
            // message can retry the write without burning a wasted agent call
            // waiting out the TTL.
            if let Err(e) = self.cache.release_lock(&lock_key).await {
                log::warn!("[STATIC_PROMPT] Failed to release lock {lock_key}: {e:?}");
            }
            return Err(anyhow::anyhow!(
                "Failed to write regex cache {regex_key}: {e:?}"
            ));
        }

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

        if samples.len() >= MAX_PROMPT_SAMPLES {
            return Ok(samples);
        }

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
            llm_client: None,
            test_regexes: Some(vec![r"\d+".to_string()]),
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
    async fn accumulator_is_capped() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");
        let lock_key = extraction_lock_cache_key(project_id, "abcd1234");

        // Simulate a persistently failing extraction: hold the lock so
        // process_prompt never runs the agent / clears the accumulator.
        assert!(
            handler
                .cache
                .try_acquire_lock(&lock_key, EXTRACTION_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );

        for i in 0..MAX_PROMPT_SAMPLES + 5 {
            handler
                .process_prompt(&make_message(project_id, &format!("prompt {i}")))
                .await
                .unwrap();
        }

        let samples = handler
            .cache
            .get::<Vec<String>>(&accumulator_key)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(samples.len(), MAX_PROMPT_SAMPLES);
    }

    #[tokio::test]
    async fn drains_without_accumulating_when_no_llm_client() {
        let mut handler = make_handler();
        handler.test_regexes = None;
        let project_id = Uuid::new_v4();
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");

        handler
            .process_prompt(&make_message(project_id, "prompt"))
            .await
            .unwrap();

        assert!(!handler.cache.exists(&accumulator_key).await.unwrap());
    }

    #[tokio::test]
    async fn failed_extraction_keeps_lock_and_accumulator() {
        let mut handler = make_handler();
        // Empty test regexes simulate the agent exhausting its temperature
        // ladder without an answer.
        handler.test_regexes = Some(Vec::new());
        let project_id = Uuid::new_v4();
        let regex_key = static_regex_cache_key(project_id, "abcd1234");
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");
        let lock_key = extraction_lock_cache_key(project_id, "abcd1234");

        for i in 0..MIN_PROMPT_SAMPLES - 1 {
            handler
                .process_prompt(&make_message(project_id, &format!("prompt {i}")))
                .await
                .unwrap();
        }
        let result = handler
            .process_prompt(&make_message(project_id, "prompt 4"))
            .await;

        assert!(result.is_err());
        assert!(!handler.cache.exists(&regex_key).await.unwrap());
        // Samples are kept for the retry after the lock TTL expires.
        assert!(handler.cache.exists(&accumulator_key).await.unwrap());
        // Lock is deliberately left held so its TTL rate-limits retries.
        assert!(
            !handler
                .cache
                .try_acquire_lock(&lock_key, EXTRACTION_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );
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
