//! Per-agent window of recent distinct system prompts (v2 pipeline).
//!
//! Split across two key spaces, because they have opposite access patterns:
//!
//! * **the window blob** (`(project, agent_hash)`) — entry metadata only, and
//!   every field on it mutates (`seen_count`, `labeled`, the entry list).
//!   Read-modify-written on every message.
//! * **one line-hash key per entry** (`(project, agent_hash, full_prompt_hash)`)
//!   — immutable once written, and read only when the full algorithm runs (a
//!   few percent of messages). Raw prompt text is never stored; bodies are
//!   refetched from ClickHouse when a mint needs agent samples.
//!
//! Keeping the hashes in the blob meant every message rewrote every entry's
//! hashes to touch two counters — megabytes to mutate a couple hundred bytes.
//!
//! A rare lost append under concurrent workers is harmless (the window is a
//! sample, and the next message re-adds the prompt).
//!
//! Version rows are NOT delivered through the window: unresolved messages
//! park on the delay queue and re-check on redelivery, so an entry keeps only
//! one representative span (for raw-prompt refetch), never a pending-refs
//! backlog.

use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::keys::{SYSTEM_PROMPT_WINDOW_CACHE_KEY, SYSTEM_PROMPT_WINDOW_LINES_CACHE_KEY};
use crate::cache::{Cache, CacheTrait};

use super::similarity;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpanRef {
    pub trace_id: Uuid,
    pub span_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowEntry {
    /// 128-bit content hash of the raw prompt (byte-identity dedup key), and
    /// the id of this entry's line-hash key.
    pub full_prompt_hash: String,
    /// Representative span (at most one) used for raw-prompt refetch when a
    /// mint gathers agent samples. Kept as a Vec for cache-blob compat.
    pub span_refs: Vec<SpanRef>,
    /// Occurrences of this exact prompt — drives the fully-static fallback.
    /// Parked redeliveries don't bump it (they're the same occurrence).
    pub seen_count: u64,
    /// This entry's version resolved — rows/memo for it were already written
    /// this cycle; the fully-static force skips it.
    pub labeled: bool,
    /// First sighting. Drives the deterministic LCS fold order and the top-K
    /// tiebreak, so it must NOT move when the prompt recurs.
    pub added_at: i64,
    /// Latest sighting — what age eviction reads. Separate from `added_at`
    /// because the window means "prompts seen in the last hour": a prompt
    /// arriving every minute stays, however long ago it first appeared.
    /// `None` on entries written before the field existed.
    #[serde(default)]
    pub last_seen_at: Option<i64>,
}

impl WindowEntry {
    pub fn last_seen(&self) -> i64 {
        self.last_seen_at.unwrap_or(self.added_at)
    }
}

pub fn window_cache_key(project_id: Uuid, agent_hash: &str) -> String {
    format!("{SYSTEM_PROMPT_WINDOW_CACHE_KEY}:{project_id}:{agent_hash}")
}

pub fn window_lines_cache_key(
    project_id: Uuid,
    agent_hash: &str,
    full_prompt_hash: &str,
) -> String {
    format!("{SYSTEM_PROMPT_WINDOW_LINES_CACHE_KEY}:{project_id}:{agent_hash}:{full_prompt_hash}")
}

/// Line hashes for every window entry, aligned with the window by index.
///
/// `None` means the entry's key is gone — its TTL outran the entry, or its
/// write was lost. The entry keeps its place (`seen_count` is still real
/// history) but can't take part in clustering, so callers must treat it as
/// absent rather than as an empty line set, which would read as a prompt that
/// shares nothing with anything.
pub type WindowLines = Vec<Option<Vec<u64>>>;

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

/// Write one entry's line hashes. Must land BEFORE the window blob that
/// references it: an entry pointing at a missing key drops out of clustering,
/// whereas a key with no entry is inert and expires on its own.
pub async fn save_entry_lines(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    full_prompt_hash: &str,
    line_hashes: &[u64],
    ttl_seconds: u64,
) -> anyhow::Result<()> {
    let key = window_lines_cache_key(project_id, agent_hash, full_prompt_hash);
    cache
        .insert_with_ttl(&key, line_hashes, ttl_seconds)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to write window lines {key}: {e:?}"))
}

/// Slide an existing entry's TTL, mirroring the window blob's own sliding
/// expiry so a prompt that keeps recurring keeps its hashes. `EXPIRE` carries
/// no payload, which is the point — the hot path must not rewrite them.
pub async fn touch_entry_lines(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    full_prompt_hash: &str,
    ttl_seconds: u64,
) {
    let key = window_lines_cache_key(project_id, agent_hash, full_prompt_hash);
    if let Err(e) = cache.set_ttl(&key, ttl_seconds).await {
        log::warn!("[SP_VERSIONING] Failed to refresh window lines {key}: {e:?}");
    }
}

/// Drop evicted entries' line keys. Best-effort: the TTL is the backstop, so a
/// failure here costs memory, never correctness.
///
/// Concurrent, like the loads, because this is normally 0-1 keys but bursts to
/// the whole window: the first message after an agent has been quiet longer
/// than the age bound ages out every entry at once, and sequentially that is
/// one round-trip per entry on the consumer path.
pub async fn remove_entry_lines(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    full_prompt_hashes: &[String],
) {
    join_all(
        full_prompt_hashes
            .iter()
            .map(|full_prompt_hash| async move {
                let key = window_lines_cache_key(project_id, agent_hash, full_prompt_hash);
                if let Err(e) = cache.remove(&key).await {
                    log::warn!(
                        "[SP_VERSIONING] Failed to remove evicted window lines {key}: {e:?}"
                    );
                }
            }),
    )
    .await;
}

/// Fetch the line hashes for every entry. `target_idx`'s are supplied by the
/// caller (they arrived on the message) rather than read back.
///
/// Issued concurrently: `CacheTrait` has no batch get, but the Redis
/// connection is multiplexed, so concurrent gets pipeline onto one socket
/// instead of paying a round-trip each. Read errors degrade to `None` — a
/// prompt missing from the cluster is a worse intersection, not a wrong one.
pub async fn load_window_lines(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    window: &[WindowEntry],
    target_idx: usize,
    target_lines: &[u64],
) -> WindowLines {
    let mut lines: WindowLines =
        join_all(window.iter().enumerate().map(|(idx, entry)| async move {
            if idx == target_idx {
                return None;
            }
            let key = window_lines_cache_key(project_id, agent_hash, &entry.full_prompt_hash);
            match cache.get::<Vec<u64>>(&key).await {
                Ok(lines) => lines.filter(|l| !l.is_empty()),
                Err(e) => {
                    log::warn!("[SP_VERSIONING] Failed to read window lines {key}: {e:?}");
                    None
                }
            }
        }))
        .await;
    if let Some(slot) = lines.get_mut(target_idx) {
        *slot = Some(target_lines.to_vec());
    }
    lines
}

/// Where an [`upsert_entry`] landed and what the caller still owes the
/// line-hash key space.
pub struct Upsert {
    pub idx: usize,
    /// The entry is new, so its line hashes have not been written yet.
    pub inserted: bool,
    /// Prompt hashes pushed out of the window; their line keys are now orphans.
    pub evicted: Vec<String>,
}

/// Add the incoming prompt to the window (append order preserved), then evict
/// by age and by count. Byte-identical repeats bump `seen_count` (unless
/// `bump_seen` is false — parked redeliveries are the same occurrence); new
/// prompts append with one representative span.
///
/// `last_seen_at` is refreshed on EVERY sighting including parked
/// redeliveries, unlike `seen_count`. The two answer different questions: how
/// many times this prompt occurred, versus whether its entry is still live.
/// Letting a redelivery's own entry age out mid-retry would evict the entry
/// the message is about to be classified against.
pub fn upsert_entry(
    window: &mut Vec<WindowEntry>,
    full_prompt_hash: &str,
    representative: Option<SpanRef>,
    window_size: usize,
    max_age_seconds: i64,
    min_entries: usize,
    bump_seen: bool,
) -> Upsert {
    let now = chrono::Utc::now().timestamp();
    let inserted = match window
        .iter()
        .position(|e| e.full_prompt_hash == full_prompt_hash)
    {
        Some(idx) => {
            let entry = &mut window[idx];
            if bump_seen {
                entry.seen_count = entry.seen_count.saturating_add(1);
            }
            entry.last_seen_at = Some(now);
            false
        }
        None => {
            window.push(WindowEntry {
                full_prompt_hash: full_prompt_hash.to_string(),
                span_refs: representative.into_iter().collect(),
                seen_count: 1,
                labeled: false,
                added_at: now,
                last_seen_at: Some(now),
            });
            true
        }
    };

    let evicted = evict(
        window,
        full_prompt_hash,
        window_size,
        max_age_seconds,
        min_entries,
        now,
    );
    // `evict` is explicitly told to spare it, so this cannot fail even for a
    // degenerate `max_age_seconds` or `window_size`.
    let idx = window
        .iter()
        .position(|e| e.full_prompt_hash == full_prompt_hash)
        .expect("the entry just touched is spared by eviction");
    Upsert {
        idx,
        inserted,
        evicted,
    }
}

/// Age first, then the size cap — both on `last_seen_at`. `spare` is the entry
/// being classified right now and is never evicted, whatever the bounds say.
///
/// Age eviction stops at `min_entries`: below that the oldest entries are kept
/// past the age bound, because a window that empties between prompts leaves
/// nothing to cluster and the mint degenerates to the triggering prompt
/// verbatim. The size cap has no such floor — it only fires when the window is
/// already far above one.
///
/// Neither pass can drain the front: once a repeat refreshes `last_seen_at`,
/// append order no longer implies recency order, so an actively-recurring
/// prompt can sit at the head of the window.
fn evict(
    window: &mut Vec<WindowEntry>,
    spare: &str,
    window_size: usize,
    max_age_seconds: i64,
    min_entries: usize,
    now: i64,
) -> Vec<String> {
    let mut evicted = Vec::new();
    let cutoff = now - max_age_seconds;

    // Scan before sorting: nothing ages out on the vast majority of calls, and
    // both the sort and the rebuild cost an allocation the size of the window.
    let droppable = window.len().saturating_sub(min_entries);
    let any_stale = window
        .iter()
        .any(|e| e.last_seen() < cutoff && e.full_prompt_hash != spare);
    if droppable > 0 && any_stale {
        // Oldest first, so the entries kept past the age bound are the most
        // recent ones — the floor retains the freshest evidence, not whatever
        // happened to be at the front.
        let mut stale: Vec<usize> = (0..window.len())
            .filter(|&i| window[i].last_seen() < cutoff && window[i].full_prompt_hash != spare)
            .collect();
        stale.sort_by_key(|&i| (window[i].last_seen(), window[i].added_at));
        stale.truncate(droppable);
        let drop: std::collections::HashSet<usize> = stale.into_iter().collect();
        let mut kept = Vec::with_capacity(window.len() - drop.len());
        for (idx, entry) in window.drain(..).enumerate() {
            if drop.contains(&idx) {
                evicted.push(entry.full_prompt_hash);
            } else {
                kept.push(entry);
            }
        }
        *window = kept;
    }

    let size = window_size.max(1);
    if window.len() > size {
        let mut by_recency: Vec<usize> = (0..window.len())
            .filter(|&i| window[i].full_prompt_hash != spare)
            .collect();
        by_recency.sort_by_key(|&i| (window[i].last_seen(), window[i].added_at));
        let drop: std::collections::HashSet<usize> =
            by_recency.into_iter().take(window.len() - size).collect();
        let mut kept = Vec::with_capacity(size);
        for (idx, entry) in window.drain(..).enumerate() {
            if drop.contains(&idx) {
                evicted.push(entry.full_prompt_hash);
            } else {
                kept.push(entry);
            }
        }
        *window = kept;
    }

    evicted
}

/// Indices of the up-to-`k` window entries closest to the target entry by
/// line-set Jaccard, target itself included (self-similarity 1.0). Ties break
/// deterministically on recency then content hash.
///
/// Entries whose line hashes are missing are not candidates at all — scoring
/// them 0 would still let them fill the cluster when the window is thin, and
/// the LCS fold would then have nothing to fold for them.
pub fn select_top_k(
    window: &[WindowEntry],
    lines: &WindowLines,
    target_idx: usize,
    k: usize,
) -> Vec<usize> {
    let Some(Some(target_lines)) = lines.get(target_idx) else {
        return Vec::new();
    };
    let target_set = similarity::line_hash_set(target_lines);
    let mut scored: Vec<(f64, usize)> = window
        .iter()
        .enumerate()
        .filter_map(|(idx, _)| {
            let entry_lines = lines.get(idx)?.as_ref()?;
            let score = if idx == target_idx {
                1.0
            } else {
                similarity::jaccard(&target_set, &similarity::line_hash_set(entry_lines))
            };
            Some((score, idx))
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
    use std::collections::{HashMap, HashSet};

    use super::*;

    fn make_ref() -> SpanRef {
        SpanRef {
            trace_id: Uuid::new_v4(),
            span_id: Uuid::new_v4(),
        }
    }

    const HOUR: i64 = 3600;

    /// The window blob plus the line-hash key space it references, kept in
    /// step the way `resolve_message` keeps them. Lines are resolved by prompt
    /// hash rather than by position, because eviction no longer removes only
    /// from the front.
    #[derive(Default)]
    struct Win {
        entries: Vec<WindowEntry>,
        known: HashMap<String, Vec<u64>>,
        forgotten: HashSet<String>,
        evicted: Vec<String>,
    }

    impl Win {
        /// No floor, so the age bound alone governs — the shape every test
        /// predating [`upsert_entry`]'s `min_entries` was written against.
        fn add_bounded(&mut self, text: &str, size: usize, max_age: i64) -> usize {
            self.add_floored(text, size, max_age, 0)
        }

        fn add_floored(&mut self, text: &str, size: usize, max_age: i64, floor: usize) -> usize {
            let hash = similarity::full_prompt_hash(text);
            let up = upsert_entry(
                &mut self.entries,
                &hash,
                Some(make_ref()),
                size,
                max_age,
                floor,
                true,
            );
            if up.inserted {
                self.known.insert(hash, similarity::line_hashes(text));
            }
            for gone in &up.evicted {
                self.known.remove(gone);
            }
            self.evicted = up.evicted;
            up.idx
        }

        fn add(&mut self, text: &str, size: usize) -> usize {
            self.add_bounded(text, size, HOUR)
        }

        fn lines(&self) -> WindowLines {
            self.entries
                .iter()
                .map(|e| {
                    if self.forgotten.contains(&e.full_prompt_hash) {
                        None
                    } else {
                        self.known.get(&e.full_prompt_hash).cloned()
                    }
                })
                .collect()
        }

        /// Simulate a line-hash key that expired or was never written.
        fn forget_lines(&mut self, idx: usize) {
            self.forgotten
                .insert(self.entries[idx].full_prompt_hash.clone());
        }

        /// Backdate an entry's last sighting, so age eviction can be exercised
        /// without faking the clock.
        fn backdate(&mut self, idx: usize, seconds: i64) {
            let e = &mut self.entries[idx];
            e.last_seen_at = Some(e.last_seen() - seconds);
        }

        fn hashes(&self) -> Vec<String> {
            self.entries
                .iter()
                .map(|e| e.full_prompt_hash.clone())
                .collect()
        }
    }

    #[test]
    fn dedups_identical_prompts_and_keeps_one_representative() {
        let mut w = Win::default();
        let idx1 = w.add("same\nprompt", 50);
        let first_ref = w.entries[0].span_refs[0];
        let idx2 = w.add("same\nprompt", 50);
        assert_eq!(idx1, idx2);
        assert_eq!(w.entries.len(), 1);
        assert_eq!(w.entries[0].seen_count, 2);
        assert_eq!(w.entries[0].span_refs, vec![first_ref]);
    }

    #[test]
    fn parked_redelivery_does_not_bump_seen_count() {
        let mut w = Win::default();
        w.add("same\nprompt", 50);
        let hash = similarity::full_prompt_hash("same\nprompt");
        upsert_entry(&mut w.entries, &hash, Some(make_ref()), 50, HOUR, 0, false);
        assert_eq!(w.entries[0].seen_count, 1);
    }

    #[test]
    fn repeat_of_a_known_prompt_needs_no_line_write() {
        let mut w = Win::default();
        w.add("same\nprompt", 50);
        let up = upsert_entry(
            &mut w.entries,
            &similarity::full_prompt_hash("same\nprompt"),
            Some(make_ref()),
            50,
            HOUR,
            0,
            true,
        );
        assert!(!up.inserted, "hot path must not rewrite immutable hashes");
        assert!(up.evicted.is_empty());
    }

    #[test]
    fn evicts_oldest_past_capacity() {
        let mut w = Win::default();
        for i in 0..5 {
            w.add(&format!("prompt {i}"), 3);
        }
        assert_eq!(w.entries.len(), 3);
        // Oldest two evicted; newest three retained in order.
        assert_eq!(
            w.entries[0].full_prompt_hash,
            similarity::full_prompt_hash("prompt 2")
        );
        assert_eq!(
            w.entries[2].full_prompt_hash,
            similarity::full_prompt_hash("prompt 4")
        );
    }

    #[test]
    fn eviction_reports_the_hashes_whose_line_keys_are_now_orphans() {
        let mut w = Win::default();
        w.add("prompt 0", 2);
        w.add("prompt 1", 2);
        w.add("prompt 2", 2);
        assert_eq!(
            w.evicted,
            vec![similarity::full_prompt_hash("prompt 0")],
            "the caller can only delete what upsert reports"
        );
    }

    #[test]
    fn entries_not_seen_within_the_window_age_out() {
        let mut w = Win::default();
        w.add("prompt 0", 200);
        w.add("prompt 1", 200);
        w.backdate(0, 2 * HOUR);

        w.add("prompt 2", 200);
        assert_eq!(
            w.evicted,
            vec![similarity::full_prompt_hash("prompt 0")],
            "stale entry evicted by age, not by the size cap"
        );
        assert_eq!(w.entries.len(), 2);
    }

    /// Without a floor a slow agent's window empties between prompts and the
    /// mint intersects a cluster of one — the prompt verbatim, which matches
    /// only itself and forces a fresh mint on the next prompt.
    #[test]
    fn age_eviction_stops_at_the_floor() {
        let mut w = Win::default();
        for i in 0..5 {
            w.add_floored(&format!("prompt {i}"), 200, HOUR, 3);
        }
        for i in 0..5 {
            w.backdate(i, 2 * HOUR);
        }
        // Every entry is stale, but only enough are dropped to reach the floor
        // — and the incoming entry counts toward it.
        w.add_floored("prompt 5", 200, HOUR, 3);
        assert_eq!(w.entries.len(), 3);
        assert_eq!(w.evicted.len(), 3);
    }

    /// The floor must retain the FRESHEST stale entries, not whatever sits at
    /// the front — they are the best evidence of the current prompt.
    #[test]
    fn the_floor_keeps_the_most_recent_stale_entries() {
        let mut w = Win::default();
        for i in 0..4 {
            w.add_floored(&format!("prompt {i}"), 200, HOUR, 2);
        }
        // Oldest first: prompt 0 is the stalest, prompt 3 the freshest.
        for i in 0..4 {
            w.backdate(i, (4 - i as i64) * HOUR);
        }
        w.add_floored("prompt 4", 200, HOUR, 2);
        let kept = w.hashes();
        assert_eq!(kept.len(), 2);
        assert!(kept.contains(&similarity::full_prompt_hash("prompt 3")));
        assert!(kept.contains(&similarity::full_prompt_hash("prompt 4")));
    }

    /// A window already far above the floor is unaffected — the floor only
    /// engages once age eviction would take it below.
    #[test]
    fn the_floor_does_not_hold_back_ordinary_age_eviction() {
        let mut w = Win::default();
        for i in 0..6 {
            w.add_floored(&format!("prompt {i}"), 200, HOUR, 3);
        }
        w.backdate(0, 2 * HOUR);
        w.add_floored("prompt 6", 200, HOUR, 3);
        assert_eq!(
            w.evicted,
            vec![similarity::full_prompt_hash("prompt 0")],
            "the one stale entry still goes; the floor is nowhere near"
        );
    }

    /// The size cap has no floor: it only fires when the window is already far
    /// above one, so the two bounds can't fight.
    #[test]
    fn the_size_cap_still_applies_above_the_floor() {
        let mut w = Win::default();
        for i in 0..5 {
            w.add_floored(&format!("prompt {i}"), 3, HOUR, 10);
        }
        assert_eq!(w.entries.len(), 3, "size cap wins over a larger floor");
    }

    #[test]
    fn a_recurring_prompt_never_ages_out() {
        let mut w = Win::default();
        let idx = w.add("recurring", 200);
        w.add("other", 200);
        // First seen long ago, but seen again just now.
        w.entries[idx].added_at -= 2 * HOUR;

        w.add("recurring", 200);
        assert!(w.evicted.is_empty(), "last_seen governs age, not added_at");
        assert_eq!(w.entries.len(), 2);
    }

    #[test]
    fn the_size_cap_drops_the_least_recently_seen_not_the_front() {
        let mut w = Win::default();
        w.add("oldest but busy", 2);
        w.add("idle", 2);
        w.backdate(1, 5);
        // Refresh the head so append order and recency order disagree.
        w.add("oldest but busy", 2);

        w.add("newcomer", 2);
        assert_eq!(
            w.evicted,
            vec![similarity::full_prompt_hash("idle")],
            "front of the window was the most recently seen entry"
        );
        assert!(
            w.hashes()
                .contains(&similarity::full_prompt_hash("oldest but busy"))
        );
    }

    #[test]
    fn the_entry_being_classified_is_never_evicted() {
        let mut w = Win::default();
        w.add("a", 200);
        w.add("b", 200);
        // Degenerate bounds: nothing is recent enough and only one slot exists.
        let idx = w.add_bounded("c", 1, -1);
        assert_eq!(w.entries.len(), 1);
        assert_eq!(
            w.entries[idx].full_prompt_hash,
            similarity::full_prompt_hash("c")
        );
    }

    #[test]
    fn top_k_prefers_similar_entries_and_includes_target() {
        let mut w = Win::default();
        // Version A: shared skeleton with per-prompt dynamic line.
        for i in 0..4 {
            w.add(&format!("head\nuser: {i}\nbody\ntail"), 50);
        }
        // Unrelated template.
        w.add("totally\ndifferent\ncontent", 50);
        let target = w.add("head\nuser: 99\nbody\ntail", 50);

        let selected = select_top_k(&w.entries, &w.lines(), target, 5);
        assert_eq!(selected[0], target, "target has self-similarity 1.0");
        assert_eq!(selected.len(), 5);
        assert!(
            !selected.contains(&4),
            "unrelated template ranks below the 5 same-version prompts"
        );
    }

    #[test]
    fn top_k_caps_at_window_size() {
        let mut w = Win::default();
        let target = w.add("a\nb", 50);
        assert_eq!(
            select_top_k(&w.entries, &w.lines(), target, 10),
            vec![target]
        );
    }

    #[test]
    fn entries_without_line_hashes_are_not_candidates() {
        let mut w = Win::default();
        for i in 0..3 {
            w.add(&format!("head\nuser: {i}\nbody"), 50);
        }
        let target = w.add("head\nuser: 99\nbody", 50);
        w.forget_lines(1);

        let selected = select_top_k(&w.entries, &w.lines(), target, 10);
        assert!(
            !selected.contains(&1),
            "an entry with no hashes must not fill the cluster — the LCS fold \
             would have nothing to fold for it"
        );
        assert_eq!(selected.len(), 3);
    }

    #[test]
    fn a_target_without_line_hashes_selects_nothing() {
        let mut w = Win::default();
        let target = w.add("a\nb", 50);
        w.forget_lines(target);
        assert!(select_top_k(&w.entries, &w.lines(), target, 10).is_empty());
    }
}
