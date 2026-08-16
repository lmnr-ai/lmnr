//! Per-agent window of recent distinct system prompts (v2 pipeline).
//!
//! One Redis blob per `(project, agent_hash)` holding the last N distinct
//! prompts in compact form (line hashes, no raw text — raw bodies are
//! refetched from ClickHouse only when a mint needs agent samples). Updated
//! read-modify-write on the queue consumer; a rare lost append under
//! concurrent workers is harmless (the window is a sample, and the next
//! message re-adds the prompt).
//!
//! Version rows are NOT delivered through the window: unresolved messages
//! park on the delay queue and re-check on redelivery, so an entry keeps only
//! one representative span (for raw-prompt refetch), never a pending-refs
//! backlog.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::keys::SYSTEM_PROMPT_WINDOW_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};

use super::similarity;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpanRef {
    pub trace_id: Uuid,
    pub span_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowEntry {
    /// 128-bit content hash of the raw prompt (byte-identity dedup key).
    pub full_prompt_hash: String,
    pub line_hashes: Vec<u64>,
    /// Representative span (at most one) used for raw-prompt refetch when a
    /// mint gathers agent samples. Kept as a Vec for cache-blob compat.
    pub span_refs: Vec<SpanRef>,
    /// Occurrences of this exact prompt — drives the fully-static fallback.
    /// Parked redeliveries don't bump it (they're the same occurrence).
    pub seen_count: u64,
    /// This entry's version resolved — rows/memo for it were already written
    /// this cycle; the fully-static force skips it.
    pub labeled: bool,
    pub added_at: i64,
}

pub fn window_cache_key(project_id: Uuid, agent_hash: &str) -> String {
    format!("{SYSTEM_PROMPT_WINDOW_CACHE_KEY}:{project_id}:{agent_hash}")
}

pub async fn load_window(cache: &Cache, key: &str) -> anyhow::Result<Vec<WindowEntry>> {
    cache
        .get::<Vec<WindowEntry>>(key)
        .await
        .map(Option::unwrap_or_default)
        .map_err(|e| anyhow::anyhow!("Failed to read window {key}: {e:?}"))
}

pub async fn save_window(
    cache: &Cache,
    key: &str,
    window: &[WindowEntry],
    ttl_seconds: u64,
) -> anyhow::Result<()> {
    cache
        .insert_with_ttl(key, window, ttl_seconds)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to write window {key}: {e:?}"))
}

/// Add the incoming prompt to the window (oldest→newest order) and return the
/// index of its entry. Byte-identical repeats bump `seen_count` (unless
/// `bump_seen` is false — parked redeliveries are the same occurrence); new
/// prompts append with one representative span, evicting the oldest entry
/// past `window_size`.
pub fn upsert_entry(
    window: &mut Vec<WindowEntry>,
    full_prompt_hash: &str,
    line_hashes: &[u64],
    representative: Option<SpanRef>,
    window_size: usize,
    bump_seen: bool,
) -> usize {
    if let Some(idx) = window
        .iter()
        .position(|e| e.full_prompt_hash == full_prompt_hash)
    {
        let entry = &mut window[idx];
        if bump_seen {
            entry.seen_count = entry.seen_count.saturating_add(1);
        }
        return idx;
    }

    window.push(WindowEntry {
        full_prompt_hash: full_prompt_hash.to_string(),
        line_hashes: line_hashes.to_vec(),
        span_refs: representative.into_iter().collect(),
        seen_count: 1,
        labeled: false,
        added_at: chrono::Utc::now().timestamp(),
    });
    if window.len() > window_size {
        let excess = window.len() - window_size;
        window.drain(..excess);
    }
    window.len() - 1
}

/// Indices of the up-to-`k` window entries closest to the target entry by
/// line-set Jaccard, target itself included (self-similarity 1.0). Ties break
/// deterministically on recency then content hash.
pub fn select_top_k(window: &[WindowEntry], target_idx: usize, k: usize) -> Vec<usize> {
    let target_set = similarity::line_hash_set(&window[target_idx].line_hashes);
    let mut scored: Vec<(f64, usize)> = window
        .iter()
        .enumerate()
        .map(|(idx, entry)| {
            let score = if idx == target_idx {
                1.0
            } else {
                similarity::jaccard(&target_set, &similarity::line_hash_set(&entry.line_hashes))
            };
            (score, idx)
        })
        .collect();
    scored.sort_by(|(sa, ia), (sb, ib)| {
        sb.partial_cmp(sa)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| window[*ib].added_at.cmp(&window[*ia].added_at))
            .then_with(|| {
                window[*ia]
                    .full_prompt_hash
                    .cmp(&window[*ib].full_prompt_hash)
            })
    });
    scored.into_iter().take(k).map(|(_, idx)| idx).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ref() -> SpanRef {
        SpanRef {
            trace_id: Uuid::new_v4(),
            span_id: Uuid::new_v4(),
        }
    }

    fn add_prompt(window: &mut Vec<WindowEntry>, text: &str, size: usize) -> usize {
        upsert_entry(
            window,
            &similarity::full_prompt_hash(text),
            &similarity::line_hashes(text),
            Some(make_ref()),
            size,
            true,
        )
    }

    #[test]
    fn dedups_identical_prompts_and_keeps_one_representative() {
        let mut window = Vec::new();
        let idx1 = add_prompt(&mut window, "same\nprompt", 50);
        let first_ref = window[0].span_refs[0];
        let idx2 = add_prompt(&mut window, "same\nprompt", 50);
        assert_eq!(idx1, idx2);
        assert_eq!(window.len(), 1);
        assert_eq!(window[0].seen_count, 2);
        assert_eq!(window[0].span_refs, vec![first_ref]);
    }

    #[test]
    fn parked_redelivery_does_not_bump_seen_count() {
        let mut window = Vec::new();
        add_prompt(&mut window, "same\nprompt", 50);
        let hash = similarity::full_prompt_hash("same\nprompt");
        let lines = similarity::line_hashes("same\nprompt");
        upsert_entry(&mut window, &hash, &lines, Some(make_ref()), 50, false);
        assert_eq!(window[0].seen_count, 1);
    }

    #[test]
    fn evicts_oldest_past_capacity() {
        let mut window = Vec::new();
        for i in 0..5 {
            add_prompt(&mut window, &format!("prompt {i}"), 3);
        }
        assert_eq!(window.len(), 3);
        // Oldest two evicted; newest three retained in order.
        assert_eq!(
            window[0].full_prompt_hash,
            similarity::full_prompt_hash("prompt 2")
        );
        assert_eq!(
            window[2].full_prompt_hash,
            similarity::full_prompt_hash("prompt 4")
        );
    }

    #[test]
    fn top_k_prefers_similar_entries_and_includes_target() {
        let mut window = Vec::new();
        // Version A: shared skeleton with per-prompt dynamic line.
        for i in 0..4 {
            add_prompt(&mut window, &format!("head\nuser: {i}\nbody\ntail"), 50);
        }
        // Unrelated template.
        add_prompt(&mut window, "totally\ndifferent\ncontent", 50);
        let target = add_prompt(&mut window, "head\nuser: 99\nbody\ntail", 50);

        let selected = select_top_k(&window, target, 5);
        assert_eq!(selected[0], target, "target has self-similarity 1.0");
        assert_eq!(selected.len(), 5);
        assert!(
            !selected.contains(&4),
            "unrelated template ranks below the 5 same-version prompts"
        );
    }

    #[test]
    fn top_k_caps_at_window_size() {
        let mut window = Vec::new();
        let target = add_prompt(&mut window, "a\nb", 50);
        assert_eq!(select_top_k(&window, target, 10), vec![target]);
    }
}
