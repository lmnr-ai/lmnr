//! Winning-span state: the per-trace idempotency / override record that
//! arbitrates which LLM span's input owns the trace's user task.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::keys::USER_TASK_LOCK_CACHE_KEY;

pub fn lock_cache_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{USER_TASK_LOCK_CACHE_KEY}:{project_id}:{trace_id}")
}

/// Stats of the span whose input currently owns the trace's user task.
/// Stored as short-key JSON in the lock cache under
/// `lock_cache_key(project_id, trace_id)`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UserTaskLockState {
    /// Input cost of the winning span.
    #[serde(rename = "c")]
    pub input_cost: f64,
    /// Span path depth of the winning span.
    #[serde(rename = "d")]
    pub depth: usize,
    /// Order-insensitive user naive signature of the winning span.
    #[serde(rename = "s")]
    pub user_sig: String,
}

impl UserTaskLockState {
    /// A strictly shallower candidate always overrides — it is closer to
    /// the main agent than the current winner (a deeper subagent span
    /// whose batch merely arrived first must not hold the lock against
    /// the main conversation). At equal depth, only the same (sub)agent
    /// — same user signature — with strictly higher input cost overrides
    /// (a longer context on the same conversation supersedes the earlier
    /// snapshot).
    pub fn should_override(&self, candidate: &Self) -> bool {
        if candidate.depth < self.depth {
            return true;
        }
        candidate.depth == self.depth
            && candidate.user_sig == self.user_sig
            && candidate.input_cost > self.input_cost
    }

    /// Consumer-side supersession check: does the current lock (`self`)
    /// supersede a queued candidate's `snapshot`? Bare inequality is not
    /// enough — the producer writes the lock only after the enqueue
    /// lands, so a failed lock write can leave an OLDER state in the
    /// lock. `should_override` is antisymmetric (a candidate that beat
    /// the lock can never be beaten back by it), so a differing lock the
    /// snapshot CAN override is necessarily such a stale older state:
    /// the snapshot is still the strongest known candidate and must
    /// publish, not drop.
    pub fn supersedes(&self, snapshot: &Self) -> bool {
        self != snapshot && !self.should_override(snapshot)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(cost: f64, depth: usize, sig: &str) -> UserTaskLockState {
        UserTaskLockState {
            input_cost: cost,
            depth,
            user_sig: sig.to_string(),
        }
    }

    #[test]
    fn lock_key_scopes_by_project_and_trace() {
        let p = Uuid::new_v4();
        let t = Uuid::new_v4();
        assert_eq!(lock_cache_key(p, t), format!("user_task_lock:{p}:{t}"));
    }

    #[test]
    fn equal_depth_override_requires_same_sig_higher_cost() {
        let prev = state(1.0, 2, "plain");
        assert!(prev.should_override(&state(2.0, 2, "plain")));
        // Deeper path — a subagent, not the main conversation.
        assert!(!prev.should_override(&state(2.0, 3, "plain")));
        // Different user signature — different (sub)agent shape.
        assert!(!prev.should_override(&state(2.0, 2, "env,/env")));
        // Not strictly higher cost — nothing new in the context.
        assert!(!prev.should_override(&state(1.0, 2, "plain")));
        assert!(!prev.should_override(&state(0.5, 2, "plain")));
    }

    #[test]
    fn shallower_candidate_overrides_regardless_of_sig_and_cost() {
        // A first-arriving deeper subagent must not hold the lock
        // against the shallower main agent, whose fingerprint differs.
        let subagent = state(5.0, 3, "env,/env");
        assert!(subagent.should_override(&state(1.0, 2, "plain")));
        // Same sig, shallower — closer to the main agent wins even at
        // lower cost.
        assert!(subagent.should_override(&state(1.0, 2, "env,/env")));
        // Deeper never overrides, regardless of sig or cost.
        assert!(!subagent.should_override(&state(50.0, 4, "env,/env")));
    }

    #[test]
    fn supersedes_is_order_aware_not_bare_inequality() {
        let snapshot = state(2.0, 2, "plain");
        // Identical lock — the snapshot IS the current winner: publish.
        assert!(!state(2.0, 2, "plain").supersedes(&snapshot));
        // Newer winner (shallower, or same-sig higher cost): drop.
        assert!(state(1.0, 1, "other").supersedes(&snapshot));
        assert!(state(3.0, 2, "plain").supersedes(&snapshot));
        // Stale OLDER lock left behind by a failed producer lock write
        // (the snapshot overrode it to get enqueued): must NOT drop.
        assert!(!state(1.0, 2, "plain").supersedes(&snapshot));
        assert!(!state(5.0, 3, "env,/env").supersedes(&snapshot));
    }

    #[test]
    fn lock_state_serializes_with_short_keys() {
        let s = state(1.5, 3, "plain");
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(json, r#"{"c":1.5,"d":3,"s":"plain"}"#);
        let back: UserTaskLockState = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
    }
}
