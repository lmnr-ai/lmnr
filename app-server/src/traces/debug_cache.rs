//! Server-side debugger replay cache (LAM-1715).
//!
//! On the first LLM call of a replay, the SDK asks app-server whether a recorded
//! response exists for a given input hash. The cache is keyed by
//! `(project_id, replay_trace_id)` and warmed lazily from the original trace's
//! LLM/CACHED spans (read through `spans_v0`, which reconstructs dedup'd input).
//!
//! Three outcomes go on the wire (see [`CacheLookupResponse`]):
//! - **Hit** — warm cache, recorded response found for this input hash.
//! - **Miss** — warm cache, no entry for this hash (SDK runs live forever).
//! - **Live** — warmup is still running and exceeded the timeout (SDK runs this
//!   call live and retries next call). MISS ≠ COLD ≠ Live; `Live` is *only* the
//!   warmup-timeout path, never an absent hash in a warm cache.

use std::{
    collections::HashSet,
    sync::{Arc, LazyLock},
    time::Duration,
};

use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{DEBUGGER_CACHE_KEY, DEBUGGER_CACHE_LOCK_KEY, DEBUGGER_CACHE_READY_KEY},
    },
    ch::spans::{DebugCacheSpanRow, query_debug_cache_spans_page},
    traces::input_dedup::debug_input_hash,
};

fn env_parse<T: std::str::FromStr>(name: &str, default: T) -> T {
    std::env::var(name)
        .ok()
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(default)
}

/// Spans pulled from ClickHouse per warmup page (strict/small).
static QUERY_PAGE_SIZE: LazyLock<u32> =
    LazyLock::new(|| env_parse("DEBUGGER_CACHE_QUERY_PAGE_SIZE", 8));
/// Cache ceiling: max spans admitted per `(project, trace)`.
static MAX_SPANS: LazyLock<usize> = LazyLock::new(|| env_parse("DEBUGGER_CACHE_MAX_SPANS", 256));
/// Cache ceiling: max total response bytes admitted per `(project, trace)`.
static MAX_BYTES: LazyLock<usize> =
    LazyLock::new(|| env_parse("DEBUGGER_CACHE_MAX_BYTES", 67_108_864));
/// TTL on entry keys + ready marker.
static TTL_SECONDS: LazyLock<u64> = LazyLock::new(|| env_parse("DEBUGGER_CACHE_TTL_SECONDS", 3600));
/// Warmup lock TTL (covers the entire synchronous warm).
static LOCK_TTL_SECONDS: LazyLock<u64> =
    LazyLock::new(|| env_parse("DEBUGGER_CACHE_LOCK_TTL_SECONDS", 60));
/// Max wait before a blocked caller degrades to `Live`.
static WARMUP_TIMEOUT_SECONDS: LazyLock<u64> =
    LazyLock::new(|| env_parse("DEBUGGER_CACHE_WARMUP_TIMEOUT_SECONDS", 10));

/// Poll interval for a caller waiting on the ready marker.
const READY_POLL_INTERVAL: Duration = Duration::from_millis(150);

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum CacheLookupResponse {
    /// Warm cache, recorded output to replay.
    Hit { response: Value },
    /// Warm cache, hash absent → SDK runs live forever.
    Miss {},
    /// Warmup timed out → SDK runs live this call only, retries next call.
    Live {},
}

fn entry_key(project_id: &Uuid, trace_id: &Uuid, input_hash: &str) -> String {
    format!("{DEBUGGER_CACHE_KEY}:{project_id}:{trace_id}:{input_hash}")
}

fn ready_key(project_id: &Uuid, trace_id: &Uuid) -> String {
    format!("{DEBUGGER_CACHE_READY_KEY}:{project_id}:{trace_id}")
}

fn lock_key(project_id: &Uuid, trace_id: &Uuid) -> String {
    format!("{DEBUGGER_CACHE_LOCK_KEY}:{project_id}:{trace_id}")
}

/// Normalize a `cache_until` needle: strip hyphens, lowercase. Matching is a
/// suffix match against `span_id.simple()` (32 lowercase hex, no hyphens), so
/// a full UUID, the last two groups, a raw 16-hex, or a short suffix all
/// resolve to the same span. An empty needle never matches.
fn normalize_needle(needle: &str) -> String {
    needle.replace('-', "").to_lowercase()
}

fn span_matches_needle(needle: &str, span_id: &Uuid) -> bool {
    if needle.is_empty() {
        return false;
    }
    span_id.simple().to_string().ends_with(needle)
}

/// Resolve a span's recorded output into the replay `response` value, using the
/// spec's priority order. The stored value is a tagged camelCase envelope so the
/// SDK can tell raw-provider responses from reconstructed gen_ai messages:
/// - `{ "type": "raw", "response": <lmnr.sdk.raw.response> }`
/// - `{ "type": "genAi", "messages": <gen_ai.output.messages>, "finishReason": <reason|null> }`
///
/// Returns `None` when the span carries neither output source (the span is then
/// skipped and any lookup for its input hash is a MISS).
fn resolve_response(row: &DebugCacheSpanRow) -> Option<Value> {
    if !row.raw_response.trim().is_empty()
        && let Ok(raw) = serde_json::from_str::<Value>(&row.raw_response)
    {
        return Some(serde_json::json!({ "type": "raw", "response": raw }));
    }

    if !row.gen_ai_output.trim().is_empty()
        && let Ok(messages) = serde_json::from_str::<Value>(&row.gen_ai_output)
    {
        let finish_reason =
            serde_json::from_str::<Value>(&row.finish_reason).unwrap_or(Value::Null);
        return Some(serde_json::json!({
            "type": "genAi",
            "messages": messages,
            "finishReason": finish_reason,
        }));
    }

    None
}

/// A warmed entry: the SDK-side input hash and the response envelope to replay.
struct WarmEntry {
    input_hash: String,
    response: Value,
    bytes: usize,
}

/// Why selection stopped. Distinguishes a terminating scan (needle reached or
/// ceiling hit — the entry set is final) from an exhausted one (the list ran
/// out before either, so paging must fetch more rows before the set is final).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SelectionOutcome {
    /// The `cache_until` span was found; entries are complete through it.
    NeedleFound,
    /// The cache ceiling (`MAX_SPANS` / `MAX_BYTES`) was hit before the needle.
    CeilingHit,
    /// The whole list was scanned without hitting the needle or the ceiling.
    Exhausted,
}

/// Pure selection over a `start_time` ASC ordered span list. Walks the rows,
/// admitting one entry per span that has a parseable input and a resolvable
/// response, deduping by input hash (earliest-by-start_time wins), and stopping
/// at the first of: the `cache_until` span (inclusive), the cache ceiling
/// (`MAX_SPANS` entries or `MAX_BYTES` total bytes), or the end of the list.
///
/// Returns the admitted entries plus a [`SelectionOutcome`] describing why the
/// scan stopped. The caller decides what an `Exhausted` outcome means: when the
/// list is a complete trace it is the safe degrade (needle genuinely absent →
/// the caller drops the entries so every lookup is a clean MISS); when the list
/// is one page of a larger trace it means "keep paging". Keeping that policy out
/// of this function is what lets the pager page by *admitted entries* rather than
/// raw fetched rows — a trace full of input/output-less spans no longer trips the
/// ceiling on row count and truncates before the needle.
fn select_entries(
    rows: &[DebugCacheSpanRow],
    needle: &str,
    max_spans: usize,
    max_bytes: usize,
) -> (Vec<WarmEntry>, SelectionOutcome) {
    let mut entries: Vec<WarmEntry> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut total_bytes = 0usize;

    for row in rows {
        if let Ok(input) = serde_json::from_str::<Value>(&row.input)
            && let Some(response) = resolve_response(row)
        {
            let hash = debug_input_hash(&input);
            if !seen.contains(&hash) {
                let bytes = response.to_string().len();
                if entries.len() >= max_spans || total_bytes + bytes > max_bytes {
                    return (entries, SelectionOutcome::CeilingHit);
                }
                seen.insert(hash.clone());
                total_bytes += bytes;
                entries.push(WarmEntry {
                    input_hash: hash,
                    response,
                    bytes,
                });
            }
        }

        if span_matches_needle(needle, &row.span_id) {
            return (entries, SelectionOutcome::NeedleFound);
        }
    }

    (entries, SelectionOutcome::Exhausted)
}

/// Page a trace's LLM/CACHED spans in `start_time` ASC order, re-running the pure
/// [`select_entries`] over the accumulated rows after each page until selection
/// terminates or the trace is exhausted.
///
/// Paging is bounded by *admitted entries*, never by raw fetched rows: each pass
/// stops only when `select_entries` reports `NeedleFound` or `CeilingHit`, or when
/// the page is short (`< page`, the trace ran out). A trace with many LLM/CACHED
/// spans that lack a usable input or output therefore keeps paging toward the
/// needle instead of tripping a row-count ceiling and truncating before it. The
/// re-scan cost is trivial (entries are capped at `MAX_SPANS`, so the worst case
/// is a handful of pages over a few hundred rows).
///
/// An `Exhausted` outcome means the needle is genuinely absent from the whole
/// trace → drop the entries so every lookup is a clean MISS (the safe degrade).
async fn build_entries(
    project_id: Uuid,
    trace_id: Uuid,
    cache_until: &str,
    clickhouse: clickhouse::Client,
) -> anyhow::Result<Vec<WarmEntry>> {
    let needle = normalize_needle(cache_until);
    let page = (*QUERY_PAGE_SIZE).max(1);

    let mut rows: Vec<DebugCacheSpanRow> = Vec::new();
    let mut offset = 0u32;

    let (entries, outcome) = loop {
        let fetched =
            query_debug_cache_spans_page(clickhouse.clone(), project_id, trace_id, page, offset)
                .await?;
        let trace_exhausted = (fetched.len() as u32) < page;
        rows.extend(fetched);

        let (entries, outcome) = select_entries(&rows, &needle, *MAX_SPANS, *MAX_BYTES);
        if outcome != SelectionOutcome::Exhausted || trace_exhausted {
            break (entries, outcome);
        }
        offset += page;
    };

    // Needle absent from the whole trace → cache nothing (clean MISS everywhere).
    if outcome == SelectionOutcome::Exhausted {
        if !rows.is_empty() {
            log::warn!(
                "debug cache: cache_until needle '{cache_until}' matched no span in trace \
                 {trace_id} (project {project_id}); warming with zero entries"
            );
        }
        return Ok(Vec::new());
    }

    Ok(entries)
}

/// Winner path: build the entry set, write each entry key, then set the ready
/// marker. Even an empty warm sets the marker (so every lookup is a clean MISS
/// rather than a perpetual COLD). The lock is held by the caller and released
/// after this returns.
async fn warm(
    project_id: Uuid,
    trace_id: Uuid,
    cache_until: String,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
) -> anyhow::Result<()> {
    let entries = build_entries(project_id, trace_id, &cache_until, clickhouse).await?;

    for entry in &entries {
        let key = entry_key(&project_id, &trace_id, &entry.input_hash);
        cache
            .insert_with_ttl(&key, entry.response.clone(), *TTL_SECONDS)
            .await?;
    }

    let kept = entries.len();
    let bytes: usize = entries.iter().map(|e| e.bytes).sum();
    cache
        .insert_with_ttl(&ready_key(&project_id, &trace_id), true, *TTL_SECONDS)
        .await?;

    log::debug!(
        "debug cache warmed: project {project_id} trace {trace_id} → {kept} entries, {bytes} bytes"
    );
    Ok(())
}

/// Read a single entry after the cache is known warm. A Redis read error
/// degrades to `Live` (run live this call, retry next), NOT `Miss`: `Miss` is
/// terminal ("run live forever, stop asking"), so mapping a transient cache
/// outage to it would permanently disable replay even though the entry exists.
async fn read_entry(cache: &Arc<Cache>, key: &str) -> CacheLookupResponse {
    match cache.get::<Value>(key).await {
        Ok(Some(response)) => CacheLookupResponse::Hit { response },
        Ok(None) => CacheLookupResponse::Miss {},
        Err(e) => {
            log::error!("debug cache: failed to read entry {key}: {e}");
            CacheLookupResponse::Live {}
        }
    }
}

/// Poll the ready marker until it appears or the timeout elapses.
async fn wait_for_ready(cache: &Arc<Cache>, ready: &str, timeout: Duration) -> bool {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if cache.exists(ready).await.unwrap_or(false) {
            return true;
        }
        if tokio::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(READY_POLL_INTERVAL).await;
    }
}

/// Look up a recorded response for one replay LLM call, warming the cache on the
/// first cold lookup. `session_id` is intentionally NOT part of the cache key —
/// the identity is `(project_id, replay_trace_id)`.
pub async fn lookup(
    project_id: Uuid,
    replay_trace_id: Uuid,
    cache_until: String,
    input_hash: String,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
) -> CacheLookupResponse {
    let ready = ready_key(&project_id, &replay_trace_id);
    let entry = entry_key(&project_id, &replay_trace_id, &input_hash);

    if cache.exists(&ready).await.unwrap_or(false) {
        return read_entry(&cache, &entry).await;
    }

    // COLD: a single winner warms; everyone (winner and waiters) then waits on
    // the ready marker so the whole request is bounded by the warmup timeout.
    let lock = lock_key(&project_id, &replay_trace_id);
    if cache
        .try_acquire_lock(&lock, *LOCK_TTL_SECONDS)
        .await
        .unwrap_or(false)
    {
        let cache_bg = cache.clone();
        let cache_until_bg = cache_until.clone();
        tokio::spawn(async move {
            if let Err(e) = warm(
                project_id,
                replay_trace_id,
                cache_until_bg,
                cache_bg.clone(),
                clickhouse,
            )
            .await
            {
                log::error!(
                    "debug cache warmup failed for project {project_id} trace {replay_trace_id}: {e}"
                );
            }
            if let Err(e) = cache_bg.release_lock(&lock).await {
                log::error!("debug cache: failed to release warmup lock: {e}");
            }
        });
    }

    let timeout = Duration::from_secs(*WARMUP_TIMEOUT_SECONDS);
    if wait_for_ready(&cache, &ready, timeout).await {
        read_entry(&cache, &entry).await
    } else {
        CacheLookupResponse::Live {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cross-language hash parity. The fixture is shared with the SDK test
    /// suites (mirror of `test/data/debug/*`); both repos must produce the same
    /// `expected_hash` for each input array. This is the most important test —
    /// a drift here silently breaks every cache lookup.
    #[test]
    fn hash_parity_vectors() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/test/data/debug/input_hash_vectors.json"
        );
        let raw = std::fs::read_to_string(path).expect("read input_hash_vectors.json");
        let doc: Value = serde_json::from_str(&raw).expect("parse vectors");

        for case in doc["cases"].as_array().expect("cases array") {
            let name = case["name"].as_str().unwrap();
            let input = &case["input"];
            let expected = case["expected_hash"].as_str().unwrap();
            let actual = debug_input_hash(input);
            assert_eq!(actual, expected, "hash parity mismatch for case '{name}'");
        }
    }

    /// Object key order must not affect the hash (canonicalization sorts keys).
    #[test]
    fn hash_is_key_order_invariant() {
        let a = serde_json::json!([
            { "role": "user", "content": "hi", "name": "x" }
        ]);
        let b = serde_json::json!([
            { "name": "x", "content": "hi", "role": "user" }
        ]);
        assert_eq!(debug_input_hash(&a), debug_input_hash(&b));
    }

    /// Stripping the system message must change the hash, and two inputs that
    /// differ only in their system message must hash identically.
    #[test]
    fn hash_ignores_system_message() {
        let with_sys_a = serde_json::json!([
            { "role": "system", "content": "prompt A" },
            { "role": "user", "content": "hi" }
        ]);
        let with_sys_b = serde_json::json!([
            { "role": "system", "content": "totally different prompt B" },
            { "role": "user", "content": "hi" }
        ]);
        let without_sys = serde_json::json!([
            { "role": "user", "content": "hi" }
        ]);
        assert_eq!(debug_input_hash(&with_sys_a), debug_input_hash(&with_sys_b));
        assert_eq!(
            debug_input_hash(&with_sys_a),
            debug_input_hash(&without_sys)
        );
    }

    fn uuid_with_suffix(suffix_hex: &str) -> Uuid {
        let mut s = "0".repeat(32 - suffix_hex.len());
        s.push_str(suffix_hex);
        Uuid::parse_str(&s).unwrap()
    }

    /// Build a row with a raw-response output and a single-user-message input
    /// carrying `marker` so each span produces a distinct input hash unless the
    /// marker repeats.
    fn row(span_suffix: &str, marker: &str, response: &str) -> DebugCacheSpanRow {
        DebugCacheSpanRow {
            span_id: uuid_with_suffix(span_suffix),
            input: format!(r#"[{{"role":"user","content":"{marker}"}}]"#),
            raw_response: response.to_string(),
            gen_ai_output: String::new(),
            finish_reason: String::new(),
        }
    }

    const BIG: usize = usize::MAX;

    #[test]
    fn select_keeps_through_matched_needle_inclusive() {
        let rows = vec![
            row("a1", "m1", "{}"),
            row("a2", "m2", "{}"),
            row("a3", "m3", "{}"),
        ];
        // needle matches the 2nd span → keep first two, drop the third
        let (entries, outcome) = select_entries(&rows, &normalize_needle("a2"), BIG, BIG);
        assert_eq!(entries.len(), 2);
        assert_eq!(outcome, SelectionOutcome::NeedleFound);
    }

    #[test]
    fn select_exhausted_when_needle_absent() {
        let rows = vec![row("a1", "m1", "{}"), row("a2", "m2", "{}")];
        let (_, outcome) = select_entries(&rows, &normalize_needle("ffff"), BIG, BIG);
        assert_eq!(
            outcome,
            SelectionOutcome::Exhausted,
            "absent needle → exhausted (caller drops the entries)"
        );
    }

    #[test]
    fn select_dedupes_earliest_wins() {
        // same marker → same input hash; first (earliest) occurrence wins,
        // and the needle on the last span keeps the whole range.
        let rows = vec![
            row("a1", "dup", r#"{"first":true}"#),
            row("a2", "dup", r#"{"second":true}"#),
            row("a3", "other", "{}"),
        ];
        let (entries, outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, BIG);
        assert_eq!(
            entries.len(),
            2,
            "duplicate input hash collapses to one entry"
        );
        assert_eq!(entries[0].response["response"]["first"], true);
        assert_eq!(outcome, SelectionOutcome::NeedleFound);
    }

    #[test]
    fn select_skips_spans_without_output() {
        let rows = vec![
            row("a1", "m1", ""), // no raw_response, no gen_ai → skipped
            row("a2", "m2", "{}"),
            row("a3", "m3", "{}"),
        ];
        let (entries, outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, BIG);
        assert_eq!(entries.len(), 2, "output-less span is not admitted");
        assert_eq!(outcome, SelectionOutcome::NeedleFound);
    }

    #[test]
    fn select_enforces_span_ceiling() {
        let rows = vec![
            row("a1", "m1", "{}"),
            row("a2", "m2", "{}"),
            row("a3", "m3", "{}"),
            row("a4", "m4", "{}"),
        ];
        // ceiling of 2 spans, needle would otherwise keep all four
        let (entries, outcome) = select_entries(&rows, &normalize_needle("a4"), 2, BIG);
        assert_eq!(entries.len(), 2, "span ceiling caps the kept set");
        assert_eq!(outcome, SelectionOutcome::CeilingHit);
    }

    /// Output-less spans before the needle don't consume the entry ceiling, so a
    /// trace padded with them still reaches the needle. This is the pure-side of
    /// the paging fix: the ceiling bounds *admitted entries*, not scanned rows.
    #[test]
    fn select_skips_output_less_spans_without_tripping_ceiling() {
        let rows = vec![
            row("a1", "m1", ""), // output-less, not admitted
            row("a2", "m2", ""), // output-less, not admitted
            row("a3", "m3", ""), // output-less, not admitted
            row("a4", "m4", "{}"),
        ];
        // ceiling of 1 admitted entry; the needle is on the only span that admits.
        let (entries, outcome) = select_entries(&rows, &normalize_needle("a4"), 1, BIG);
        assert_eq!(entries.len(), 1);
        assert_eq!(
            outcome,
            SelectionOutcome::NeedleFound,
            "output-less spans must not trip the entry ceiling before the needle"
        );
    }

    #[test]
    fn select_enforces_byte_ceiling() {
        let rows = vec![
            row("a1", "m1", r#"{"x":"aaaaaaaaaa"}"#),
            row("a2", "m2", r#"{"x":"bbbbbbbbbb"}"#),
            row("a3", "m3", r#"{"x":"cccccccccc"}"#),
        ];
        // Learn the real envelope sizes, then cap so only the first fits.
        let (full, full_outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, BIG);
        assert_eq!(full.len(), 3);
        assert_eq!(full_outcome, SelectionOutcome::NeedleFound);
        let cap = full[0].bytes + 1;
        let (one, outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, cap);
        assert_eq!(one.len(), 1, "byte ceiling caps the kept set");
        assert_eq!(outcome, SelectionOutcome::CeilingHit);
    }

    #[test]
    fn needle_suffix_matches_simple_id() {
        let span = Uuid::parse_str("0190d3f2-6a4b-7c8d-9e0f-112233445566").unwrap();
        let simple = span.simple().to_string();

        // full uuid, last-two-groups, raw 16-hex tail, short suffix all match
        for raw in [
            "0190d3f2-6a4b-7c8d-9e0f-112233445566",
            "9e0f-112233445566",
            "9e0f112233445566",
            "445566",
        ] {
            let needle = normalize_needle(raw);
            assert!(
                span_matches_needle(&needle, &span),
                "needle '{raw}' (norm '{needle}') should match {simple}"
            );
        }
    }

    #[test]
    fn empty_needle_never_matches() {
        let span = uuid_with_suffix("abcdef");
        assert!(!span_matches_needle(&normalize_needle(""), &span));
    }

    #[test]
    fn non_matching_needle_rejected() {
        let span = uuid_with_suffix("abcdef");
        assert!(!span_matches_needle(&normalize_needle("123456"), &span));
    }

    #[test]
    fn resolve_prefers_raw_response() {
        let row = DebugCacheSpanRow {
            span_id: Uuid::nil(),
            input: String::new(),
            raw_response: r#"{"id":"resp_1","content":"hi"}"#.to_string(),
            gen_ai_output: r#"[{"role":"assistant"}]"#.to_string(),
            finish_reason: r#""stop""#.to_string(),
        };
        let resolved = resolve_response(&row).unwrap();
        assert_eq!(resolved["type"], "raw");
        assert_eq!(resolved["response"]["id"], "resp_1");
    }

    #[test]
    fn resolve_falls_back_to_gen_ai() {
        let row = DebugCacheSpanRow {
            span_id: Uuid::nil(),
            input: String::new(),
            raw_response: String::new(),
            gen_ai_output: r#"[{"role":"assistant","content":"hi"}]"#.to_string(),
            finish_reason: r#""stop""#.to_string(),
        };
        let resolved = resolve_response(&row).unwrap();
        assert_eq!(resolved["type"], "genAi");
        assert_eq!(resolved["finishReason"], "stop");
        assert_eq!(resolved["messages"][0]["role"], "assistant");
    }

    #[test]
    fn resolve_gen_ai_null_finish_reason() {
        let row = DebugCacheSpanRow {
            span_id: Uuid::nil(),
            input: String::new(),
            raw_response: String::new(),
            gen_ai_output: r#"[{"role":"assistant"}]"#.to_string(),
            finish_reason: String::new(),
        };
        let resolved = resolve_response(&row).unwrap();
        assert_eq!(resolved["finishReason"], Value::Null);
    }

    #[test]
    fn resolve_none_without_output() {
        let row = DebugCacheSpanRow {
            span_id: Uuid::nil(),
            input: String::new(),
            raw_response: String::new(),
            gen_ai_output: String::new(),
            finish_reason: String::new(),
        };
        assert!(resolve_response(&row).is_none());
    }

    fn in_memory_cache() -> Arc<Cache> {
        Arc::new(Cache::InMemory(
            crate::cache::in_memory::InMemoryCache::new(None),
        ))
    }

    #[tokio::test]
    async fn read_entry_hit_when_present() {
        let cache = in_memory_cache();
        let key = "k:hit";
        let response = serde_json::json!({ "type": "raw", "response": { "ok": true } });
        cache
            .insert_with_ttl(key, response.clone(), 60)
            .await
            .unwrap();

        match read_entry(&cache, key).await {
            CacheLookupResponse::Hit { response: r } => assert_eq!(r, response),
            other => panic!("expected Hit, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn read_entry_miss_when_absent() {
        let cache = in_memory_cache();
        assert_eq!(
            read_entry(&cache, "k:absent").await,
            CacheLookupResponse::Miss {}
        );
    }

    #[tokio::test]
    async fn wait_for_ready_times_out_then_succeeds() {
        let cache = in_memory_cache();
        let ready = "k:ready";
        // not yet warm → times out quickly
        assert!(!wait_for_ready(&cache, ready, Duration::from_millis(50)).await);
        // once the marker is set → resolves
        cache.insert_with_ttl(ready, true, 60).await.unwrap();
        assert!(wait_for_ready(&cache, ready, Duration::from_millis(50)).await);
    }

    #[test]
    fn outcome_serialization_is_tagged_camel_case() {
        let hit = CacheLookupResponse::Hit {
            response: serde_json::json!({"type": "raw", "response": {}}),
        };
        let v = serde_json::to_value(&hit).unwrap();
        assert_eq!(v["outcome"], "hit");

        let miss = serde_json::to_value(CacheLookupResponse::Miss {}).unwrap();
        assert_eq!(miss["outcome"], "miss");

        let live = serde_json::to_value(CacheLookupResponse::Live {}).unwrap();
        assert_eq!(live["outcome"], "live");
    }
}
