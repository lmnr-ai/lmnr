//! Queue consumer for ingestion-time user-task extraction.
//!
//! Handles regex-cache misses enqueued by the producer hook: generates the
//! extraction regex via LLM, applies it, and patches the trace metadata.
//! Acks only after the metadata publish succeeds (ack-after-write).

use std::sync::Arc;

use async_trait::async_trait;

use super::{
    UserTaskLockState, build_metadata_patch, generate_and_apply_regex, lock_cache_key,
    queue::InputExtractionMessage, regex_cache_key, try_apply_cached_regex,
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
        // was enqueued.
        let result = match try_apply_cached_regex(&self.cache, &key, &message.signposted_text).await
        {
            Some(result) => result,
            None => generate_and_apply_regex(
                &self.cache,
                &self.llm_client,
                &key,
                &message.signposted_text,
            )
            .await
            .map_err(HandlerError::transient)?,
        };

        // A later batch may have superseded this candidate (published its
        // own metadata inline and rewritten the winner lock) while this
        // message sat in the queue. Publishing anyway would overwrite the
        // newer winner's `lmnr_user_task`, so drop (ack) instead. The
        // check is order-aware (`supersedes`), not bare inequality: the
        // producer writes the lock only after the enqueue lands, so a
        // failed lock write can leave an OLDER state behind — a lock this
        // snapshot can override must not drop it. Absent lock or cache
        // error fails open — a redundant publish beats a missing one.
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
