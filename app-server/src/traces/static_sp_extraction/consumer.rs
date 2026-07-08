//! Consumer for the static-prompt queue.
//!
//! Accumulates raw system prompts per naive signature until enough samples
//! exist, then runs the extraction agent once (under a per-signature lock)
//! and caches the produced regex list.

use std::sync::{Arc, LazyLock};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    ExtractionConfig, ExtractionTracing, accumulator_cache_key, accumulator_occurrences_cache_key,
    extract_static_regexes, extraction_lock_cache_key, static_regex_cache_key,
};
use crate::{
    cache::{Cache, CacheTrait},
    env,
    llm::LlmClient,
    worker::{HandlerError, MessageHandler},
};

/// Number of same-signature system prompts to accumulate before triggering the
/// extraction agent. More samples let the agent tell static text from dynamic
/// fragments reliably. Read once — this is on the per-message consumer path.
static PROMPT_SAMPLES: LazyLock<usize> = LazyLock::new(|| env::static_sp::PROMPT_SAMPLES.get());

/// TTL (seconds) on the accumulated raw prompts, so signatures that never reach
/// `PROMPT_SAMPLES` don't hold onto prompt bodies forever.
static ACCUMULATOR_TTL_SECONDS: LazyLock<u64> =
    LazyLock::new(|| env::static_sp::ACCUMULATOR_TTL_SECONDS.get());

/// Fallback trigger: total same-signature occurrences after which we resolve a
/// signature even though its unique samples never reached `PROMPT_SAMPLES`. A
/// byte-identical (fully static) prompt collapses to one unique sample forever,
/// so without this it would never extract and the producer would re-enqueue on
/// every trace. Set high so we only conclude "no diversity" after a fair chance
/// at seeing it — at low volume the perpetual-miss cost is negligible anyway.
static STATIC_PROMPT_OCCURRENCE_THRESHOLD: LazyLock<u64> =
    LazyLock::new(|| env::static_sp::OCCURRENCE_THRESHOLD.get());

/// TTL on the per-signature extraction lock: long enough for the agent to
/// produce a regex list (normally under 10 min; the per-step upper bounds
/// are high just in case, so leave generous headroom)
const EXTRACTION_LOCK_TTL_SECONDS: u64 = 60 * 60;

const STATIC_REGEX_TTL_SECONDS: u64 = 7 * 24 * 3600;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticPromptQueueMessage {
    pub project_id: Uuid,
    /// Source trace of this prompt — the accumulator dedups on it.
    pub trace_id: Uuid,
    /// Naive signature (`lmnr.span.prompt_hash`) shared by all runs of the
    /// same agent.
    pub prompt_hash: String,
    pub system_prompt: String,
}

/// One accumulated sample for a signature. `trace_id` is retained only to
/// enforce one-sample-per-trace (16 bytes vs the multi-KB prompt).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct AccumulatedSample {
    trace_id: Uuid,
    prompt: String,
}

pub struct StaticPromptHandler {
    pub cache: Arc<Cache>,
    /// The shared LLM client. In production this handler is only spawned when
    /// the client is `Some` (a client-less node must NOT consume this queue,
    /// or it would ack-and-drop work another node enqueued). `None` is
    /// reachable only via the test seam below.
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
        std::env::var(crate::env::connections::STATIC_SP_INTERNAL_PROJECT_ID)
            .ok()
            .and_then(|s| s.parse().ok())
    }

    /// Run the extraction agent on the accumulated samples. The agent itself
    /// never errors — an empty regex list means every attempt failed, which
    /// is surfaced as an error so the caller keeps the extraction lock held
    /// (its TTL then rate-limits retries).
    async fn run_extraction(
        &self,
        samples: &[String],
        prompt_hash: &str,
    ) -> anyhow::Result<Vec<String>> {
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
                prompt_hash: Some(prompt_hash.to_string()),
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
        // Defensive: production no longer spawns this handler without a
        // client (see main.rs), so this is effectively test-only. A
        // client-less handler can't extract, so bail without accumulating.
        if !self.extraction_available() {
            return Ok(());
        }

        let regex_key = static_regex_cache_key(message.project_id, &message.prompt_hash);

        // The producer checked too, but the regex may have landed while this
        // message sat in the queue.
        if self.cache.exists(&regex_key).await.unwrap_or(false) {
            return Ok(());
        }

        let (occurrences, samples) = self.accumulate_prompt(message).await?;
        log::debug!(
            "[STATIC_SP] Accumulated samples: {} (occurrences={}, prompt_hash={})",
            samples.len(),
            occurrences,
            message.prompt_hash
        );

        // Trigger on enough distinct samples, OR once we've seen enough total
        // occurrences that further waiting is unlikely to add diversity — a
        // fully-static prompt collapses to one unique sample forever and would
        // otherwise never resolve (the producer would re-enqueue every trace).
        let enough_diversity = samples.len() >= *PROMPT_SAMPLES;
        let waited_long_enough = occurrences >= *STATIC_PROMPT_OCCURRENCE_THRESHOLD;
        if !enough_diversity && !waited_long_enough {
            return Ok(());
        }
        let prompts: Vec<String> = samples.into_iter().map(|s| s.prompt).collect();

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

        let regexes = if prompts.len() <= 1 {
            // A single unique sample can't be diffed — the prompt is effectively
            // static, nothing to strip. Cache an empty list (a valid result) so
            // the producer stops re-enqueuing this signature.
            log::debug!(
                "[STATIC_SP] Static prompt for {} (1 unique sample); caching empty regex list",
                message.prompt_hash
            );
            Vec::new()
        } else {
            // Any agent failure (diverse OR low-diversity) releases the lock so a
            // later message retries immediately — low diversity is usually easier
            // to collapse, so retrying is worthwhile.
            match self.run_extraction(&prompts, &message.prompt_hash).await {
                Ok(regexes) => regexes,
                Err(e) => {
                    if let Err(e) = self.cache.release_lock(&lock_key).await {
                        log::warn!("[STATIC_PROMPT] Failed to release lock {lock_key}: {e:?}");
                    }
                    return Err(e);
                }
            }
        };

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

        // Raw samples (and the occurrence counter) are no longer needed once the
        // regex list exists.
        let accumulator_key = accumulator_cache_key(message.project_id, &message.prompt_hash);
        if let Err(e) = self.cache.remove(&accumulator_key).await {
            log::warn!("[STATIC_PROMPT] Failed to clear accumulator {accumulator_key}: {e:?}");
        }
        let occurrences_key =
            accumulator_occurrences_cache_key(message.project_id, &message.prompt_hash);
        if let Err(e) = self.cache.remove(&occurrences_key).await {
            log::warn!("[STATIC_PROMPT] Failed to clear occurrences {occurrences_key}: {e:?}");
        }

        if let Err(e) = self.cache.release_lock(&lock_key).await {
            log::warn!("[STATIC_PROMPT] Failed to release lock {lock_key}: {e:?}");
        }

        Ok(())
    }

    /// Append the prompt to the signature's sample list and return the total
    /// occurrences seen plus the updated (deduplicated) sample list.
    ///
    /// Deduplicates so the agent gets varied samples, not repeats: at most one
    /// sample per trace (the first 5 spans of a signature usually come from the
    /// same trace and would be identical), and no two byte-identical prompts
    /// (zero added variance, wasted memory). The occurrence counter lives in a
    /// separate small key so bumping it on every message doesn't rewrite the
    /// multi-KB samples blob; it drives the static-prompt fallback.
    async fn accumulate_prompt(
        &self,
        message: &StaticPromptQueueMessage,
    ) -> anyhow::Result<(u64, Vec<AccumulatedSample>)> {
        let key = accumulator_cache_key(message.project_id, &message.prompt_hash);
        let mut samples = self
            .cache
            .get::<Vec<AccumulatedSample>>(&key)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to read accumulator {key}: {e:?}"))?
            .unwrap_or_default();

        // Enough diversity already accumulated — the trigger fires on sample
        // count, so the occurrence counter no longer matters here.
        if samples.len() >= *PROMPT_SAMPLES {
            return Ok((0, samples));
        }

        // Bump the (small) occurrence counter on every message, deduped or not.
        // `increment` is atomic (no lost updates when workers race on the same
        // signature), but INCR leaves the key with no expiry, so refresh the TTL
        // each time to keep it sliding with the samples blob. Best-effort: a
        // lost increment only delays the static-prompt fallback.
        let occurrences_key =
            accumulator_occurrences_cache_key(message.project_id, &message.prompt_hash);
        let occurrences = self
            .cache
            .increment(&occurrences_key, 1)
            .await
            .unwrap_or(1)
            .max(0) as u64;
        if let Err(e) = self
            .cache
            .set_ttl(&occurrences_key, *ACCUMULATOR_TTL_SECONDS)
            .await
        {
            log::warn!("[STATIC_PROMPT] Failed to set TTL on occurrences {occurrences_key}: {e:?}");
        }

        // Drop same-trace resamples and byte-identical prompts — they add no
        // variance, so we don't rewrite the samples blob for them.
        let is_duplicate = samples
            .iter()
            .any(|s| s.trace_id == message.trace_id || s.prompt == message.system_prompt);
        if is_duplicate {
            return Ok((occurrences, samples));
        }

        samples.push(AccumulatedSample {
            trace_id: message.trace_id,
            prompt: message.system_prompt.clone(),
        });

        self.cache
            .insert_with_ttl(&key, &samples, *ACCUMULATOR_TTL_SECONDS)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to write accumulator {key}: {e:?}"))?;

        Ok((occurrences, samples))
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

    /// Each call gets a fresh trace_id so distinct-prompt samples accumulate
    /// (the accumulator dedups on trace_id).
    fn make_message(project_id: Uuid, prompt: &str) -> StaticPromptQueueMessage {
        make_message_with_trace(project_id, Uuid::new_v4(), prompt)
    }

    fn make_message_with_trace(
        project_id: Uuid,
        trace_id: Uuid,
        prompt: &str,
    ) -> StaticPromptQueueMessage {
        StaticPromptQueueMessage {
            project_id,
            trace_id,
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

        for i in 0..*PROMPT_SAMPLES - 1 {
            handler
                .process_prompt(&make_message(project_id, &format!("prompt {i}")))
                .await
                .unwrap();
            assert!(!handler.cache.exists(&regex_key).await.unwrap());
        }

        let samples = handler
            .cache
            .get::<Vec<AccumulatedSample>>(&accumulator_key)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(samples.len(), *PROMPT_SAMPLES - 1);

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

        for i in 0..*PROMPT_SAMPLES + 5 {
            handler
                .process_prompt(&make_message(project_id, &format!("prompt {i}")))
                .await
                .unwrap();
        }

        let samples = handler
            .cache
            .get::<Vec<AccumulatedSample>>(&accumulator_key)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(samples.len(), *PROMPT_SAMPLES);
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
    async fn failed_extraction_releases_lock_keeps_accumulator() {
        let mut handler = make_handler();
        // Empty test regexes simulate the agent finishing without an answer.
        handler.test_regexes = Some(Vec::new());
        let project_id = Uuid::new_v4();
        let regex_key = static_regex_cache_key(project_id, "abcd1234");
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");
        let lock_key = extraction_lock_cache_key(project_id, "abcd1234");

        for i in 0..*PROMPT_SAMPLES - 1 {
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
        // Samples are kept so a later retry doesn't re-accumulate from scratch.
        assert!(handler.cache.exists(&accumulator_key).await.unwrap());
        // Lock is released on failure so a later message can retry immediately.
        assert!(
            handler
                .cache
                .try_acquire_lock(&lock_key, EXTRACTION_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );
    }

    #[tokio::test]
    async fn dedups_same_trace_resamples() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");

        // Same trace, different prompt bodies (a self-editing agent across
        // turns): only the first is kept.
        for i in 0..*PROMPT_SAMPLES + 2 {
            handler
                .process_prompt(&make_message_with_trace(
                    project_id,
                    trace_id,
                    &format!("prompt {i}"),
                ))
                .await
                .unwrap();
        }

        let samples = handler
            .cache
            .get::<Vec<AccumulatedSample>>(&accumulator_key)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(samples.len(), 1);
    }

    #[tokio::test]
    async fn dedups_byte_identical_prompts_across_traces() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");

        // Distinct traces, but byte-identical prompt (fully-static template):
        // only one sample is stored and the threshold is never reached.
        for _ in 0..*PROMPT_SAMPLES + 2 {
            handler
                .process_prompt(&make_message_with_trace(
                    project_id,
                    Uuid::new_v4(),
                    "identical prompt",
                ))
                .await
                .unwrap();
        }

        let samples = handler
            .cache
            .get::<Vec<AccumulatedSample>>(&accumulator_key)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(samples.len(), 1);
    }

    #[tokio::test]
    async fn static_prompt_caches_empty_regex_after_occurrence_threshold() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let regex_key = static_regex_cache_key(project_id, "abcd1234");
        let accumulator_key = accumulator_cache_key(project_id, "abcd1234");
        let occurrences_key = accumulator_occurrences_cache_key(project_id, "abcd1234");

        // A fully-static prompt: byte-identical across distinct traces, so it
        // never reaches PROMPT_SAMPLES uniques. Once occurrences hit the
        // threshold we resolve it by caching an empty regex list.
        for _ in 0..*STATIC_PROMPT_OCCURRENCE_THRESHOLD {
            handler
                .process_prompt(&make_message_with_trace(
                    project_id,
                    Uuid::new_v4(),
                    "identical prompt",
                ))
                .await
                .unwrap();
        }

        let cached = handler
            .cache
            .get::<Vec<String>>(&regex_key)
            .await
            .unwrap()
            .unwrap();
        assert!(cached.is_empty());
        // Accumulator and counter are cleared, so no further re-enqueuing work.
        assert!(!handler.cache.exists(&accumulator_key).await.unwrap());
        assert!(!handler.cache.exists(&occurrences_key).await.unwrap());
    }

    #[tokio::test]
    async fn drops_when_extraction_lock_held() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let regex_key = static_regex_cache_key(project_id, "abcd1234");
        let lock_key = extraction_lock_cache_key(project_id, "abcd1234");

        for i in 0..*PROMPT_SAMPLES - 1 {
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
