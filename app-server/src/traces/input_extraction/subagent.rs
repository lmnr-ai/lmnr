//! Subagent classification and per-locator input/output extraction
//! (LAM-1953). A subagent is identified by its LOCATOR: the branch-point
//! span at the owning agent's depth on the candidate span's ids_path
//! (commonly a TOOL span whose direct child is the subagent's first LLM
//! call). Each locator gets its own input/output metadata slots and locks.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use super::lock::{
    OutputLockState, SubagentInputLockState, subagent_input_lock_cache_key,
    subagent_output_lock_cache_key,
};
use super::metadata::{build_subagent_metadata_patch, subagent_output_metadata_key};
use super::output::OutputCandidate;
use super::producer::UserTaskCandidate;
use super::queue::{InputExtractionMessage, SubagentTarget, push_to_input_extraction_queue};
use super::regex::{regex_cache_key, try_apply_cached_regex};
use crate::cache::{Cache, CacheTrait};
use crate::db::DB;
use crate::env::user_task::USER_TASK_LOCK_TTL_SECONDS;
use crate::mq::MessageQueue;
use crate::traces::metadata::publish_trace_metadata_patch;

/// The branch-point span at the owning agent's depth on a candidate
/// span's ids_path. Subagent metadata keys and locks all key on its id.
#[derive(Debug, Clone, PartialEq)]
pub struct Locator {
    pub span_id: Uuid,
    /// 0-based index of the locator on the extended span path; the label
    /// is the name-path prefix `0..=path_index`.
    pub path_index: usize,
}

/// Dot-joined name-path prefix down to and including the locator,
/// published under `lmnr_subagent_path.<uuid>` as a display label.
pub fn locator_label(span_path: &[String], path_index: usize) -> String {
    let end = (path_index + 1).min(span_path.len());
    span_path[..end].join(".")
}

/// Descent walk: starting from the main winner lock's depth, find the
/// locator whose subagent subtree owns a span at `span_depth`. The
/// element at index `gate_depth - 1` is the branch-point span at the
/// owning agent's level; a registered `st_in_lock` whose `d` is still
/// above the span descends into that nested subagent's space. Spans at
/// or above the gate depth belong to the gating agent itself — `None`.
/// Any malformed ids_path, unparsable id, or cache read error also
/// resolves to `None` (fail-closed for classification only; main-input
/// processing is never affected).
pub async fn resolve_locator(
    ids: &[String],
    span_depth: usize,
    main_gate_depth: usize,
    project_id: Uuid,
    trace_id: Uuid,
    cache: &Arc<Cache>,
) -> Option<Locator> {
    let mut gate_depth = main_gate_depth;
    loop {
        if gate_depth == 0 || span_depth <= gate_depth {
            return None;
        }
        let locator = Uuid::parse_str(ids.get(gate_depth - 1)?).ok()?;
        let lock_key = subagent_input_lock_cache_key(project_id, trace_id, locator);
        let lock: Option<SubagentInputLockState> = cache.get(&lock_key).await.ok()?;
        match lock {
            // `l.depth > gate_depth` guarantees the walk strictly
            // descends (terminates) even on malformed lock data.
            Some(l) if span_depth > l.depth && l.depth > gate_depth => gate_depth = l.depth,
            _ => {
                return Some(Locator {
                    span_id: locator,
                    path_index: gate_depth - 1,
                });
            }
        }
    }
}

/// Per-locator subagent-input pipeline: mirrors the main user-task flow
/// 1:1 — lock gate (earliest start wins), shared regex cache, inline
/// publish on hit, enqueue for LLM regex generation on miss, guarded
/// lock write on success. The `st_in_lock` write doubles as the
/// locator's REGISTRATION: its `d` drives the descent walk and the
/// output gate. All failures are logged and swallowed.
pub async fn process_subagent_input_candidate(
    candidate: &UserTaskCandidate,
    locator: &Locator,
    label: &str,
    depth: usize,
    trace_id: Uuid,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) {
    let state = SubagentInputLockState {
        depth,
        start_time_ns: candidate.start_time_ns,
    };
    let lock_key = subagent_input_lock_cache_key(project_id, trace_id, locator.span_id);
    let current: Option<SubagentInputLockState> = match cache.get(&lock_key).await {
        Ok(v) => v,
        Err(e) => {
            log::error!("subagent-input: lock read failed for trace [{trace_id}]: {e:?}");
            None
        }
    };
    if current.is_some_and(|c| !c.should_override(&state)) {
        return;
    }

    let regex_key = regex_cache_key(
        project_id,
        candidate.prompt_hash.as_deref(),
        &candidate.fingerprint,
    );
    let inline_result = try_apply_cached_regex(
        &cache,
        &regex_key,
        &candidate.signposted_text,
        project_id,
        trace_id,
    )
    .await;

    if inline_result.is_some() {
        // Re-read the lock before the inline publish: a concurrent
        // batch's full cycle can complete inside the window since the
        // gate read above.
        let rechecked: Option<SubagentInputLockState> = cache.get(&lock_key).await.ok().flatten();
        if rechecked.is_some_and(|c| c.supersedes(&state)) {
            log::debug!(
                "subagent-input: dropping superseded inline extraction for trace [{trace_id}]"
            );
            return;
        }
    }

    let effect_landed = match inline_result {
        Some(result) => {
            let patch = build_subagent_metadata_patch(&result, locator.span_id, label);
            match publish_trace_metadata_patch(
                trace_id,
                project_id,
                patch,
                queue.clone(),
                db.clone(),
                cache.clone(),
            )
            .await
            {
                Ok(()) => true,
                Err(e) => {
                    log::error!(
                        "subagent-input: failed to publish metadata patch for trace [{trace_id}]: {e:?}"
                    );
                    false
                }
            }
        }
        None => {
            // TODO: a short-TTL per-fingerprint in-flight marker would
            // suppress duplicate generation enqueues from same-batch
            // sibling subagents sharing one prompt template.
            let message = InputExtractionMessage {
                trace_id,
                project_id,
                prompt_hash: candidate.prompt_hash.clone(),
                signposted_text: candidate.signposted_text.clone(),
                fingerprint: candidate.fingerprint.clone(),
                winner_state: None,
                subagent: Some(SubagentTarget {
                    span_id: locator.span_id,
                    label: label.to_string(),
                    winner_state: Some(state.clone()),
                }),
            };
            match push_to_input_extraction_queue(message, queue.clone()).await {
                Ok(enqueued) => enqueued,
                Err(e) => {
                    log::error!(
                        "subagent-input: failed to enqueue extraction for trace [{trace_id}]: {e:?}"
                    );
                    false
                }
            }
        }
    };

    if effect_landed {
        // Guarded lock write after the effect landed (same pattern as
        // the main flow): never roll the lock back under a newer winner.
        let current: Option<SubagentInputLockState> = cache.get(&lock_key).await.ok().flatten();
        if !current.is_some_and(|c| c.supersedes(&state))
            && let Err(e) = cache
                .insert_with_ttl(&lock_key, &state, USER_TASK_LOCK_TTL_SECONDS.get())
                .await
        {
            log::error!("subagent-input: lock write failed for trace [{trace_id}]: {e:?}");
        }
    }
}

/// Per-locator subagent-output pipeline: registration gate (the locator
/// must have a registered `st_in_lock`), output lock gate (shallower
/// depth wins, then latest end time), inline metadata publish, guarded
/// lock write. No queue, no LLM, no regex.
pub async fn process_subagent_output_candidate(
    candidate: &OutputCandidate,
    locator: &Locator,
    depth: usize,
    trace_id: Uuid,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) {
    let in_lock_key = subagent_input_lock_cache_key(project_id, trace_id, locator.span_id);
    let registered: Option<SubagentInputLockState> = cache.get(&in_lock_key).await.ok().flatten();
    if registered.is_none() {
        return;
    }

    let state = OutputLockState {
        depth,
        end_time_ns: candidate.end_time_ns,
    };
    let lock_key = subagent_output_lock_cache_key(project_id, trace_id, locator.span_id);
    let current: Option<OutputLockState> = match cache.get(&lock_key).await {
        Ok(v) => v,
        Err(e) => {
            log::error!("subagent-output: lock read failed for trace [{trace_id}]: {e:?}");
            None
        }
    };
    if current.is_some_and(|c| !c.should_override(&state)) {
        return;
    }

    let patch = HashMap::from([(
        subagent_output_metadata_key(locator.span_id),
        Value::String(candidate.text.clone()),
    )]);
    if let Err(e) =
        publish_trace_metadata_patch(trace_id, project_id, patch, queue, db, cache.clone()).await
    {
        log::error!(
            "subagent-output: failed to publish metadata patch for trace [{trace_id}]: {e:?}"
        );
        return;
    }

    let current: Option<OutputLockState> = cache.get(&lock_key).await.ok().flatten();
    if !current.is_some_and(|c| c.supersedes(&state))
        && let Err(e) = cache
            .insert_with_ttl(&lock_key, &state, USER_TASK_LOCK_TTL_SECONDS.get())
            .await
    {
        log::error!("subagent-output: lock write failed for trace [{trace_id}]: {e:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    fn make_cache() -> Arc<Cache> {
        Arc::new(Cache::InMemory(InMemoryCache::new(None)))
    }

    fn id(n: u8) -> String {
        format!("00000000-0000-0000-0000-0000000000{n:02x}")
    }

    async fn register(
        cache: &Arc<Cache>,
        project_id: Uuid,
        trace_id: Uuid,
        locator: &str,
        depth: usize,
    ) {
        let key =
            subagent_input_lock_cache_key(project_id, trace_id, Uuid::parse_str(locator).unwrap());
        cache
            .insert(
                &key,
                &SubagentInputLockState {
                    depth,
                    start_time_ns: 1,
                },
            )
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn resolves_flat_subagent_via_tool_span() {
        // main llm at depth 2 (gate 2); tool span at depth 2 spawns a
        // subagent whose llm call sits at depth 3.
        let cache = make_cache();
        let (p, t) = (Uuid::new_v4(), Uuid::new_v4());
        let ids = vec![id(1), id(2), id(3)];
        let locator = resolve_locator(&ids, 3, 2, p, t, &cache).await.unwrap();
        assert_eq!(locator.span_id, Uuid::parse_str(&id(2)).unwrap());
        assert_eq!(locator.path_index, 1);
    }

    #[tokio::test]
    async fn descends_into_nested_subagent() {
        // Outer subagent registered at locator id(2) with d=3; a span at
        // depth 4 descends past it to the nested locator id(3).
        let cache = make_cache();
        let (p, t) = (Uuid::new_v4(), Uuid::new_v4());
        register(&cache, p, t, &id(2), 3).await;
        let ids = vec![id(1), id(2), id(3), id(4)];
        let locator = resolve_locator(&ids, 4, 2, p, t, &cache).await.unwrap();
        assert_eq!(locator.span_id, Uuid::parse_str(&id(3)).unwrap());
        assert_eq!(locator.path_index, 2);

        // A span AT the outer subagent's own llm depth (3) stays owned
        // by the outer locator — no descent.
        let ids = vec![id(1), id(2), id(5)];
        let locator = resolve_locator(&ids, 3, 2, p, t, &cache).await.unwrap();
        assert_eq!(locator.span_id, Uuid::parse_str(&id(2)).unwrap());
    }

    #[tokio::test]
    async fn spans_at_or_above_gate_depth_resolve_to_none() {
        let cache = make_cache();
        let (p, t) = (Uuid::new_v4(), Uuid::new_v4());
        let ids = vec![id(1), id(2)];
        // Main-agent spine spans are never subagents.
        assert!(resolve_locator(&ids, 2, 2, p, t, &cache).await.is_none());
        assert!(resolve_locator(&ids, 1, 2, p, t, &cache).await.is_none());
        // Degenerate gate depth 0 (empty main path) is a clean skip.
        assert!(resolve_locator(&ids, 2, 0, p, t, &cache).await.is_none());
    }

    #[tokio::test]
    async fn missing_nested_lock_stops_at_current_locator() {
        // Depth-4 span with NO registered locks: unregistered nested
        // subtrees resolve to the outermost locator (accepted v0
        // degradation — earliest-wins corrects later).
        let cache = make_cache();
        let (p, t) = (Uuid::new_v4(), Uuid::new_v4());
        let ids = vec![id(1), id(2), id(3), id(4)];
        let locator = resolve_locator(&ids, 4, 2, p, t, &cache).await.unwrap();
        assert_eq!(locator.span_id, Uuid::parse_str(&id(2)).unwrap());
        assert_eq!(locator.path_index, 1);
    }

    #[tokio::test]
    async fn short_or_malformed_ids_path_resolves_to_none() {
        let cache = make_cache();
        let (p, t) = (Uuid::new_v4(), Uuid::new_v4());
        // ids_path shorter than the locator index.
        assert!(
            resolve_locator(&[id(1)], 4, 2, p, t, &cache)
                .await
                .is_none()
        );
        // Unparsable id at the locator position.
        let ids = vec![id(1), "not-a-uuid".to_string(), id(3)];
        assert!(resolve_locator(&ids, 3, 2, p, t, &cache).await.is_none());
    }

    #[test]
    fn locator_label_joins_name_path_prefix() {
        let path: Vec<String> = ["agent", "spawn_subagent", "llm_call"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(locator_label(&path, 1), "agent.spawn_subagent");
        assert_eq!(locator_label(&path, 0), "agent");
        // Clamped when the index runs past the path (defensive).
        assert_eq!(locator_label(&path, 9), "agent.spawn_subagent.llm_call");
    }
}
