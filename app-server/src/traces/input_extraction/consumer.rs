//! Queue consumer for ingestion-time user-task extraction.
//!
//! Handles regex-cache misses enqueued by the producer hook: generates the
//! extraction regex via LLM, applies it, and patches the trace metadata.
//! Acks only after the metadata publish succeeds (ack-after-write).

use std::sync::Arc;

use async_trait::async_trait;

use super::{
    lock::{RosterEntry, UserTaskLockState, agent_io_ver, lock_cache_key, write_lock_merged},
    metadata::build_metadata_patch,
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
        // work is kept even when this candidate is dropped. `supersedes`
        // requires a strictly STRONGER published winner: an equal winner
        // is this candidate's own producer write, and a weaker one is
        // stale state the snapshot already beat (the producer moves the
        // winner only after the enqueue lands, so a failed lock write can
        // leave older state behind). Absent lock or cache error fails
        // open — a redundant publish beats a missing one.
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

        let patch = build_metadata_patch(&result);
        let ver = message
            .winner_state
            .as_ref()
            .map(|s| agent_io_ver(s.depth, s.input_tokens));
        publish_trace_metadata_patch(
            message.trace_id,
            message.project_id,
            patch,
            ver,
            self.queue.clone(),
            self.db.clone(),
            self.cache.clone(),
        )
        .await
        .map_err(HandlerError::transient)?;

        // Re-assert the winner whose extraction just published — retries
        // the producer lock write that may have failed after the enqueue,
        // so future arbitration compares against the actual metadata
        // owner. Merge-guarded and mutex-serialized via
        // `write_lock_merged`: the snapshot is folded into the current
        // lock (roster registrations survive; a genuinely stronger winner
        // written while this message was in flight is kept). Best-effort
        // like every lock write.
        if let Some(snapshot) = &message.winner_state {
            let lock_key = lock_cache_key(message.project_id, message.trace_id);
            let mut local = UserTaskLockState::new(snapshot.depth);
            local.register(RosterEntry {
                start_time_ns: snapshot.start_time_ns,
                span_id: snapshot.span_id.clone(),
            });
            local.winner = Some(snapshot.clone());
            write_lock_merged(&self.cache, &lock_key, &local, message.trace_id).await;
        }

        Ok(())
    }
}
