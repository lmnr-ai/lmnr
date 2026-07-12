//! Queue consumer for ingestion-time user-task extraction.
//!
//! Handles regex-cache misses enqueued by the producer hook: generates the
//! extraction regex via LLM, applies it, and patches the trace metadata.
//! Acks only after the metadata publish succeeds (ack-after-write).

use std::sync::Arc;

use async_trait::async_trait;

use super::{
    lock::{
        SubagentInputLockState, UserTaskLockState, lock_cache_key, subagent_input_lock_cache_key,
    },
    metadata::{build_metadata_patch, build_subagent_metadata_patch},
    queue::InputExtractionMessage,
    regex::{
        ApplyRegexResult, generate_and_apply_regex, is_passthrough_regex, regex_cache_key,
        try_apply_cached_regex,
    },
    self_tracing::{self, SpanBuilder, SpanContextCarrier, SpanScope},
};
use crate::{
    cache::{Cache, CacheTrait},
    db::DB,
    env::user_task::USER_TASK_LOCK_TTL_SECONDS,
    llm::LlmClient,
    mq::MessageQueue,
    traces::metadata::publish_trace_metadata_patch,
    worker::{HandlerError, MessageHandler},
};

pub struct InputExtractionHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub llm_client: Arc<LlmClient>,
}

#[async_trait]
impl MessageHandler for InputExtractionHandler {
    type Message = InputExtractionMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        let key = regex_cache_key(
            message.project_id,
            message.prompt_hash.as_deref(),
            &message.fingerprint,
        );

        // Another worker may have populated the cache since this message
        // was enqueued — a hit is pure regex application and emits no
        // self-tracing. Only a real generation run is traced: the root
        // span is created here (and only here — the consumer is off the
        // ingest path, so exported spans can't recurse through
        // `push_spans_to_queue`).
        let result = match try_apply_cached_regex(
            &self.cache,
            &key,
            &message.signposted_text,
            message.project_id,
            message.trace_id,
        )
        .await
        {
            Some(result) => result,
            None => {
                let scope = SpanScope::new(message.project_id, message.trace_id);
                let root = SpanBuilder::root(&scope)
                    .input(&serde_json::Value::String(message.signposted_text.clone()))
                    .build();
                self_tracing::set_attr_str(&root, "user_task.fingerprint", &message.fingerprint);
                if let Some(hash) = message.prompt_hash.as_deref() {
                    self_tracing::set_attr_str(&root, "user_task.prompt_hash", hash);
                }
                if let Some(target) = &message.subagent {
                    self_tracing::set_attr_str(
                        &root,
                        "user_task.subagent_span_id",
                        &target.span_id.to_string(),
                    );
                }
                let scope = scope.with_parent(SpanContextCarrier::from_span(&root));

                let outcome = generate_and_apply_regex(
                    &self.cache,
                    &self.llm_client,
                    &key,
                    &message.signposted_text,
                    &scope,
                )
                .await;

                self_tracing::set_metadata_bool(
                    &root,
                    "passthrough_regex",
                    is_passthrough_regex(&outcome.pattern),
                );
                // "Failed": the generated pattern failed to compile /
                // match / capture.
                self_tracing::set_metadata_bool(
                    &root,
                    "regex_failed",
                    matches!(outcome.result, ApplyRegexResult::NoMatch),
                );
                // Call budget ran out without an accepted submit; the
                // result came from the passthrough fallback.
                self_tracing::set_metadata_bool(
                    &root,
                    "budget_exhausted",
                    outcome.budget_exhausted,
                );
                // LLM generation failed (retries exhausted / non-retryable
                // error); the result came from the passthrough fallback.
                self_tracing::set_metadata_bool(&root, "llm_failed", outcome.llm_failed);
                let result = outcome.result;
                self_tracing::set_output(&root, &serde_json::json!(format!("{result:?}")));
                result
            }
        };

        // Supersession check immediately before the publish: a later batch
        // may have superseded this candidate (published its own metadata
        // inline and rewritten the winner lock) while this message sat in
        // the queue or during regex generation — checking any earlier
        // leaves that window open and this older extraction would
        // overwrite the newer winner's `lmnr_user_task`. Runs after regex
        // generation on purpose: the regex is cached per shape, so the
        // work is kept even when this candidate
        // is dropped. The check is order-aware (`supersedes`), not bare
        // inequality: the producer writes the lock only after the enqueue
        // lands, so a failed lock write can leave an OLDER state behind —
        // a lock this snapshot can override must not drop it. Absent lock
        // or cache error fails open — a redundant publish beats a missing
        // one.
        match &message.subagent {
            Some(target) => {
                if let Some(snapshot) = &target.winner_state {
                    let lock_key = subagent_input_lock_cache_key(
                        message.project_id,
                        message.trace_id,
                        target.span_id,
                    );
                    if let Ok(Some(current)) =
                        self.cache.get::<SubagentInputLockState>(&lock_key).await
                        && current.supersedes(snapshot)
                    {
                        log::debug!(
                            "subagent-input: dropping superseded extraction for trace [{}]",
                            message.trace_id
                        );
                        return Ok(());
                    }
                }
            }
            None => {
                if let Some(snapshot) = &message.winner_state {
                    let lock_key = lock_cache_key(message.project_id, message.trace_id);
                    if let Ok(Some(current)) = self.cache.get::<UserTaskLockState>(&lock_key).await
                        && current.supersedes(snapshot)
                    {
                        log::debug!(
                            "user-task: dropping superseded extraction for trace [{}]",
                            message.trace_id
                        );
                        return Ok(());
                    }
                }
            }
        }

        let patch = match &message.subagent {
            Some(target) => build_subagent_metadata_patch(&result, target.span_id, &target.label),
            None => build_metadata_patch(&result),
        };
        publish_trace_metadata_patch(
            message.trace_id,
            message.project_id,
            patch,
            self.queue.clone(),
            self.db.clone(),
            self.cache.clone(),
        )
        .await
        .map_err(HandlerError::transient)?;

        // Re-assert the winner lock for the state whose extraction just
        // published — retries the producer lock write that may have
        // failed after the enqueue, so future arbitration compares
        // against the actual metadata owner. Guarded by a re-read: a
        // genuinely newer lock written while this message was in flight
        // must not be clobbered with the older snapshot. Best-effort
        // like every lock write.
        match &message.subagent {
            Some(target) => {
                if let Some(snapshot) = &target.winner_state {
                    let lock_key = subagent_input_lock_cache_key(
                        message.project_id,
                        message.trace_id,
                        target.span_id,
                    );
                    let current: Option<SubagentInputLockState> =
                        self.cache.get(&lock_key).await.ok().flatten();
                    if !current.is_some_and(|c| c.supersedes(snapshot))
                        && let Err(e) = self
                            .cache
                            .insert_with_ttl(&lock_key, snapshot, USER_TASK_LOCK_TTL_SECONDS.get())
                            .await
                    {
                        log::error!(
                            "subagent-input: lock state write failed for trace [{}]: {e:?}",
                            message.trace_id
                        );
                    }
                }
            }
            None => {
                if let Some(snapshot) = &message.winner_state {
                    let lock_key = lock_cache_key(message.project_id, message.trace_id);
                    let current: Option<UserTaskLockState> =
                        self.cache.get(&lock_key).await.ok().flatten();
                    if !current.is_some_and(|c| c.supersedes(snapshot))
                        && let Err(e) = self
                            .cache
                            .insert_with_ttl(&lock_key, snapshot, USER_TASK_LOCK_TTL_SECONDS.get())
                            .await
                    {
                        log::error!(
                            "user-task: lock state write failed for trace [{}]: {e:?}",
                            message.trace_id
                        );
                    }
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::super::queue::InputExtractionMessage;

    #[test]
    fn legacy_message_decodes_with_no_subagent() {
        // In-flight pre-LAM-1953 messages carry none of the defaulted
        // fields; they must decode to the main-task path.
        let json = format!(
            r#"{{"trace_id":"{}","project_id":"{}","signposted_text":"hi","fingerprint":"fp"}}"#,
            Uuid::new_v4(),
            Uuid::new_v4()
        );
        let message: InputExtractionMessage = serde_json::from_str(&json).unwrap();
        assert!(message.subagent.is_none());
        assert!(message.winner_state.is_none());
        assert!(message.prompt_hash.is_none());
    }

    #[test]
    fn subagent_message_round_trips() {
        let span_id = Uuid::new_v4();
        let json = format!(
            r#"{{"trace_id":"{}","project_id":"{}","signposted_text":"hi","fingerprint":"fp",
                "subagent":{{"span_id":"{span_id}","label":"agent.tool",
                "winner_state":{{"d":3,"t":42}}}}}}"#,
            Uuid::new_v4(),
            Uuid::new_v4()
        );
        let message: InputExtractionMessage = serde_json::from_str(&json).unwrap();
        let target = message.subagent.unwrap();
        assert_eq!(target.span_id, span_id);
        assert_eq!(target.label, "agent.tool");
        let state = target.winner_state.unwrap();
        assert_eq!(state.depth, 3);
        assert_eq!(state.start_time_ns, 42);
    }
}
