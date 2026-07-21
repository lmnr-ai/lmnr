//! Trace-output capture and inline processing (LAM-1953): the latest
//! toolless assistant message from the shallowest LLM span wins the
//! `lmnr_trace_output` trace metadata key. No LLM, no regex, no queue —
//! processing is fully inline on the producer hook.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use backoff::ExponentialBackoffBuilder;
use serde_json::Value;
use uuid::Uuid;

use super::lock::{
    LOCK_WRITE_RETRY_INITIAL_BACKOFF_MS, LOCK_WRITE_RETRY_MAX_ELAPSED_MS, OutputLockState,
    agent_io_ver, trace_output_lock_cache_key,
};
use super::messages::last_assistant_text;
use super::metadata::TRACE_OUTPUT_METADATA_KEY;
use crate::cache::{Cache, CacheTrait};
use crate::db::{DB, spans::Span};
use crate::env::user_task::USER_TASK_LOCK_TTL_SECONDS;
use crate::mq::MessageQueue;
use crate::traces::metadata::publish_trace_metadata_patch;

/// Per-span output candidate captured inside `preprocess_for_queue`,
/// BEFORE the dedup strip removes `span.output`.
#[derive(Debug, Clone)]
pub struct OutputCandidate {
    pub text: String,
    pub end_time_ns: i64,
}

pub fn capture_output_candidate(span: &Span) -> Option<OutputCandidate> {
    if !span.is_llm_span() {
        return None;
    }
    let text = last_assistant_text(span.output.as_ref()?)?;
    Some(OutputCandidate {
        // Out-of-range end times degrade to "latest possible": outputs
        // prefer the most recent final answer, so unknown-time beats real.
        end_time_ns: span.end_time.timestamp_nanos_opt().unwrap_or(i64::MAX),
        text,
    })
}

/// Inline trace-output processing: lock gate (shallower depth wins, then
/// latest end time), metadata publish, guarded lock write. Fails open on
/// cache errors; all failures are logged and swallowed.
///
/// Get-then-set race, ACCEPTED for the PG metadata path (same class as
/// the input path's both-publish-before-either-locks interleaving):
/// two batches can both pass the gate and their patches — separate MQ
/// messages — can be MERGED into PG in either order, so
/// `lmnr_trace_output` may transiently keep the older answer while the
/// lock records the newer winner. No producer-side re-check can close
/// this (the gate and publish are adjacent — unlike the input path
/// there's no round-trip between them, and consumer-side merge order is
/// out of the producer's hands). Any strictly-newer output repairs the
/// value; only the trace's final two racing batches can leave it stale.
/// The `trace_agent_output` RMT row is immune by construction — its
/// `agent_io_ver` converges to the newest answer regardless of arrival
/// order, which is the store the traces_agg read path uses.
pub async fn process_trace_output_candidate(
    candidate: &OutputCandidate,
    depth: usize,
    trace_id: Uuid,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) {
    let state = OutputLockState {
        depth,
        end_time_ns: candidate.end_time_ns,
    };
    let lock_key = trace_output_lock_cache_key(project_id, trace_id);
    let current: Option<OutputLockState> = match cache.get(&lock_key).await {
        Ok(v) => v,
        Err(e) => {
            log::error!("trace-output: lock read failed for trace [{trace_id}]: {e:?}");
            None
        }
    };
    if current.is_some_and(|c| !c.should_override(&state)) {
        return;
    }

    let patch = HashMap::from([(
        TRACE_OUTPUT_METADATA_KEY.to_string(),
        Value::String(candidate.text.clone()),
    )]);
    // RMT version for the trace_agent_output row: end-time millis under
    // the inverted-depth major, mirroring the lock's arbitration order.
    let ver = agent_io_ver(depth, candidate.end_time_ns / 1_000_000);
    if let Err(e) = publish_trace_metadata_patch(
        trace_id,
        project_id,
        patch,
        Some(ver),
        queue,
        db,
        cache.clone(),
    )
    .await
    {
        log::error!("trace-output: failed to publish metadata patch for trace [{trace_id}]: {e:?}");
        return;
    }

    // Guarded lock write after the effect landed: a newer winner can take
    // the lock while this publish was in flight; writing blindly would
    // roll it back and let an older output overwrite the newer one later.
    // The write is RETRIED (conventional `backoff` crate, short budget):
    // unlike the input path there is no queued consumer to re-assert an
    // output lock, so a publish that lands without its lock write leaves
    // the gate open for a later WEAKER output to overwrite the stronger
    // value in PG while the RMT row keeps it — retrying closes the
    // transient-blip case; a persistently dead cache stays best-effort
    // (logged) like every lock write. The guard re-read runs per attempt
    // so a newer winner arriving mid-retry is still respected.
    let write_backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_millis(LOCK_WRITE_RETRY_INITIAL_BACKOFF_MS))
        .with_max_elapsed_time(Some(Duration::from_millis(LOCK_WRITE_RETRY_MAX_ELAPSED_MS)))
        .build();
    let write_result = backoff::future::retry(write_backoff, || async {
        let current: Option<OutputLockState> = cache.get(&lock_key).await.ok().flatten();
        if current.is_some_and(|c| !c.should_override(&state)) {
            // A newer winner took the lock mid-flight: nothing to write.
            return Ok(());
        }
        cache
            .insert_with_ttl(&lock_key, &state, USER_TASK_LOCK_TTL_SECONDS.get())
            .await
            .map_err(|e| backoff::Error::transient(anyhow::anyhow!("{e:?}")))
    })
    .await;
    if let Err(e) = write_result {
        log::error!("trace-output: lock write failed for trace [{trace_id}]: {e:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traces::span_attributes::SPAN_TYPE;
    use crate::traces::spans::SpanAttributes;
    use serde_json::json;
    use std::collections::HashMap;

    fn llm_span(output: Option<Value>) -> Span {
        Span {
            name: "llm_call".to_string(),
            attributes: SpanAttributes::new(HashMap::from([(SPAN_TYPE.to_string(), json!("LLM"))])),
            output,
            ..Default::default()
        }
    }

    #[test]
    fn captures_last_toolless_assistant_text() {
        let span = llm_span(Some(json!([
            { "role": "user", "content": "hi" },
            { "role": "assistant", "content": "final answer" }
        ])));
        let candidate = capture_output_candidate(&span).unwrap();
        assert_eq!(candidate.text, "final answer");
    }

    #[test]
    fn skips_non_llm_spans_and_missing_output() {
        let mut span = llm_span(Some(json!([
            { "role": "assistant", "content": "answer" }
        ])));
        span.attributes = SpanAttributes::new(HashMap::new());
        span.span_type = crate::db::spans::SpanType::Default;
        assert!(capture_output_candidate(&span).is_none());

        let span = llm_span(None);
        assert!(capture_output_candidate(&span).is_none());
    }

    #[test]
    fn skips_output_with_only_tool_call_messages() {
        let span = llm_span(Some(json!([
            {
                "role": "assistant",
                "content": null,
                "tool_calls": [{ "id": "c1", "function": { "name": "f" } }]
            }
        ])));
        assert!(capture_output_candidate(&span).is_none());
    }
}
