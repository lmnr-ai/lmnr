//! Trace-output capture and inline processing (LAM-1953): the latest
//! toolless assistant message from the shallowest LLM span wins the
//! `lmnr_trace_output` trace metadata key. No LLM, no regex, no queue —
//! processing is fully inline on the producer hook.

use std::sync::Arc;

use uuid::Uuid;

use super::lock::{OutputLockState, trace_output_lock_cache_key, write_output_lock_guarded};
use super::messages::last_assistant_text;
use crate::cache::{Cache, CacheTrait};
use crate::db::{DB, spans::Span};
use crate::mq::MessageQueue;
use crate::traces::metadata::publish_trace_output_update;

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
/// Get-then-set race, ACCEPTED for the PG metadata path: two batches can
/// both pass the gate and their patches — separate MQ messages — can be
/// MERGED into PG in either order, so `lmnr_trace_output` may transiently
/// keep the older answer while the lock records the newer winner. Any
/// strictly-newer output repairs the value. The `trace_agent_output` RMT
/// row versions on `updated_at`, so it converges on the newest write; a
/// missed lock write only risks a redundant re-publish.
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

    if let Err(e) = publish_trace_output_update(
        trace_id,
        project_id,
        candidate.text.clone(),
        queue,
        db,
        cache.clone(),
    )
    .await
    {
        log::error!("trace-output: failed to publish metadata patch for trace [{trace_id}]: {e:?}");
        return;
    }

    write_output_lock_guarded(&cache, &lock_key, &state, trace_id).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traces::span_attributes::SPAN_TYPE;
    use crate::traces::spans::SpanAttributes;
    use serde_json::{Value, json};
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
