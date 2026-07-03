//! Queue consumer for ingestion-time user-task extraction.
//!
//! Handles regex-cache misses enqueued by the producer hook: generates the
//! extraction regex via LLM, applies it, and patches the trace metadata.
//! Acks only after the metadata publish succeeds (ack-after-write).

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;

use super::{
    lock::{UserTaskLockState, lock_cache_key},
    metadata::build_metadata_patch,
    queue::{InputExtractionMessage, push_to_input_extraction_queue},
    regex::{generate_and_apply_regex, regex_cache_key, try_apply_cached_regex},
    self_tracing::{self, SpanBuilder, SpanContextCarrier, SpanScope},
};
use crate::{
    cache::{Cache, CacheTrait},
    db::{DB, trace::trace_exists},
    env::user_task::USER_TASK_LOCK_TTL_SECONDS,
    llm::LlmClient,
    mq::MessageQueue,
    traces::metadata::publish_trace_metadata_patch,
    worker::{HandlerError, MessageHandler},
};

/// The metadata patch silently no-ops against a trace row that doesn't
/// exist yet (`merge_trace_metadata_batch` must never create stub rows),
/// so the consumer waits for the row with delayed re-enqueues before
/// publishing. Bounded: a trace that never materializes (deleted, or its
/// span batch was rejected) must not circulate forever.
const MAX_TRACE_WAIT_RETRIES: u32 = 5;
const TRACE_WAIT_DELAY: Duration = Duration::from_secs(1);

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
        // Internal self-tracing root for this message. Safe here (and only
        // here): the consumer is off the ingest path, so exported spans
        // can't recurse through `push_spans_to_queue`.
        let scope = SpanScope::new(message.trace_id);
        let root = SpanBuilder::root(&scope)
            .input(&serde_json::Value::String(message.signposted_text.clone()))
            .build();
        self_tracing::set_attr_str(&root, "user_task.fingerprint", &message.fingerprint);
        if let Some(hash) = message.prompt_hash.as_deref() {
            self_tracing::set_attr_str(&root, "user_task.prompt_hash", hash);
        }
        let scope = scope.with_parent(SpanContextCarrier::from_span(&root));

        let key = regex_cache_key(
            message.project_id,
            message.prompt_hash.as_deref(),
            &message.fingerprint,
        );

        // Another worker may have populated the cache since this message
        // was enqueued.
        let result = match try_apply_cached_regex(&self.cache, &key, &message.signposted_text).await
        {
            Some(result) => {
                self_tracing::emit_cache_hit(
                    &scope,
                    &serde_json::Value::String(message.signposted_text.clone()),
                    &serde_json::json!(format!("{result:?}")),
                );
                result
            }
            None => generate_and_apply_regex(
                &self.cache,
                &self.llm_client,
                &key,
                &message.signposted_text,
                Some(&scope),
            )
            .await
            .map_err(HandlerError::transient)?,
        };
        self_tracing::set_output(&root, &serde_json::json!(format!("{result:?}")));

        // Wait for the trace row before publishing: the patch is applied by
        // `merge_trace_metadata_batch` which silently skips missing traces,
        // so publishing early acks a no-op and the winner lock then gates
        // equal-state retries for the whole TTL. Runs AFTER regex
        // generation on purpose — the generated regex is cached per shape,
        // so the work isn't lost across re-enqueues (or even across
        // traces). Existence-check errors fail open (publish): a
        // possibly-early patch beats dropping the extraction.
        let row_exists = trace_exists(&self.db.pool, message.project_id, message.trace_id)
            .await
            .unwrap_or_else(|e| {
                log::error!(
                    "user-task: trace existence check failed for trace [{}]: {e:?}",
                    message.trace_id
                );
                true
            });
        if !row_exists {
            if message.trace_wait_retries >= MAX_TRACE_WAIT_RETRIES {
                // The trace never materialized (deleted, or its span batch
                // was rejected) — nothing to patch. Drop (ack); the winner
                // lock expires with its TTL.
                log::warn!(
                    "user-task: trace row [{}] still missing after {} retries, dropping extraction",
                    message.trace_id,
                    message.trace_wait_retries
                );
                return Ok(());
            }
            tokio::time::sleep(TRACE_WAIT_DELAY).await;
            let requeued = InputExtractionMessage {
                trace_wait_retries: message.trace_wait_retries + 1,
                ..message
            };
            match push_to_input_extraction_queue(requeued, self.queue.clone()).await {
                // Ok(false) (oversize drop) is unreachable here — the
                // message already fit on this queue and only grew by a
                // counter — but treat it like an enqueue error anyway.
                Ok(true) => return Ok(()),
                Ok(false) | Err(_) => {
                    return Err(HandlerError::transient(anyhow::anyhow!(
                        "trace row [{}] not created yet and re-enqueue failed",
                        message.trace_id
                    )));
                }
            }
        }

        // Supersession check AFTER the trace-row wait, immediately before
        // the publish: a later batch may have superseded this candidate
        // (published its own metadata inline and rewritten the winner
        // lock) while this message sat in the queue OR during the
        // `trace_exists` round-trip just above — checking any earlier
        // leaves that window open and this older extraction would
        // overwrite the newer winner's `lmnr_user_task`. (Re-enqueue
        // iterations re-enter here, so the check also re-runs after every
        // wait hop.) Runs after regex generation on purpose: the regex is
        // cached per shape, so the work is kept even when this candidate
        // is dropped. The check is order-aware (`supersedes`), not bare
        // inequality: the producer writes the lock only after the enqueue
        // lands, so a failed lock write can leave an OLDER state behind —
        // a lock this snapshot can override must not drop it. Absent lock
        // or cache error fails open — a redundant publish beats a missing
        // one.
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
        if let Some(snapshot) = &message.winner_state {
            let lock_key = lock_cache_key(message.project_id, message.trace_id);
            let current: Option<UserTaskLockState> = self.cache.get(&lock_key).await.ok().flatten();
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

        Ok(())
    }
}
