//! Trace-output capture and inline processing (LAM-1953 rework): every LLM
//! span on the current user-task input winner's path (see
//! `super::lock::main_agent_path_cache_key`) publishes its output message
//! hashes as the trace's "output so far." No LLM, no regex, no queue, no
//! independent lock — arbitration is inherited from the input winner, and
//! "latest wins" is enforced by the `trace_agent_output` RMT version
//! (`updated_at` = the span's end time), not by a separate depth/end-time
//! gate.

use std::sync::Arc;

use uuid::Uuid;

use crate::cache::Cache;
use crate::db::DB;
use crate::mq::MessageQueue;
use crate::traces::input_dedup::MessageDedup;
use crate::traces::metadata::publish_trace_output_update;

/// Per-span output candidate captured inside `preprocess_for_queue`, AFTER
/// the output dedup verdict is computed — the hashes are exactly
/// `MessageDedup.hashes` for the span's output array, i.e. every message in
/// the array, in order (no filtering to "the last toolless assistant
/// message": tool-call-only turns are captured too, since it's cheaper to
/// always write the latest than to predict a model-specific "I'm done" tool).
#[derive(Debug, Clone)]
pub struct OutputCandidate {
    pub hashes: Vec<[u8; 32]>,
    pub end_time_ns: i64,
}

/// Build an output candidate from the producer's output dedup verdict.
/// `end_time_ns` is the span's own end time; out-of-range/unknown values
/// degrade to `i64::MAX` ("unknown beats real" — outputs prefer the most
/// recent final answer).
pub fn capture_output_candidate(
    output_dedup: Option<&MessageDedup>,
    end_time_ns: i64,
) -> Option<OutputCandidate> {
    let dedup = output_dedup?;
    if dedup.hashes.is_empty() {
        return None;
    }
    Some(OutputCandidate {
        hashes: dedup.hashes.clone(),
        end_time_ns,
    })
}

/// Publish this candidate as the trace's output. Callers have already
/// established that this span is on the main-agent path (or that no path is
/// established yet, in which case every LLM span is treated as a
/// candidate) — this function does no further gating; "latest wins" is
/// enforced by the `trace_agent_output` RMT version.
pub async fn process_trace_output_candidate(
    candidate: &OutputCandidate,
    trace_id: Uuid,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) {
    if let Err(e) = publish_trace_output_update(
        trace_id,
        project_id,
        candidate.hashes.clone(),
        candidate.end_time_ns,
        queue,
        db,
        cache,
    )
    .await
    {
        log::error!("trace-output: failed to publish metadata patch for trace [{trace_id}]: {e:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dedup(hashes: Vec<[u8; 32]>) -> MessageDedup {
        MessageDedup {
            hashes,
            trace_new_indices: vec![],
            trace_new_contents: vec![],
            storage_miss_offsets: vec![],
        }
    }

    #[test]
    fn captures_all_output_hashes_in_order() {
        let h1 = [1u8; 32];
        let h2 = [2u8; 32];
        let d = dedup(vec![h1, h2]);
        let candidate = capture_output_candidate(Some(&d), 100).unwrap();
        assert_eq!(candidate.hashes, vec![h1, h2]);
        assert_eq!(candidate.end_time_ns, 100);
    }

    #[test]
    fn captures_tool_call_only_output() {
        // No special-casing for tool-call-only turns: the whole output
        // array is hashed and captured regardless of message shape.
        let d = dedup(vec![[9u8; 32]]);
        assert!(capture_output_candidate(Some(&d), 5).is_some());
    }

    #[test]
    fn skips_none_dedup_and_empty_hashes() {
        assert!(capture_output_candidate(None, 5).is_none());
        assert!(capture_output_candidate(Some(&dedup(vec![])), 5).is_none());
    }
}
