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

#[cfg(test)]
mod tests;

use std::{
    collections::HashSet,
    sync::{Arc, LazyLock},
    time::Duration,
};

use serde::{Deserialize, Serialize};
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

/// Strongly-typed envelope stored in the cache and sent on the wire.
/// Both variants carry `finish_reasons` (null when absent) and `model`
/// (null when absent) so the SDK never has to fish inside an opaque blob.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum DebugCacheResponse {
    /// The span recorded a raw provider response (`lmnr.sdk.raw.response`).
    Raw {
        response: Value,
        finish_reasons: Option<Vec<String>>,
        model: Option<String>,
    },
    /// The span's output was reconstructed from gen_ai / output columns.
    GenAi {
        messages: Value,
        finish_reasons: Option<Vec<String>>,
        model: Option<String>,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum CacheLookupResponse {
    /// Warm cache, recorded output to replay.
    Hit { response: DebugCacheResponse },
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

/// Resolve a span's recorded output into a typed [`DebugCacheResponse`].
///
/// Returns `None` when the span carries neither output source (the span is then
/// skipped and any lookup for its input hash is a MISS).
fn resolve_response(row: &DebugCacheSpanRow) -> Option<DebugCacheResponse> {
    let finish_reasons = resolve_finish_reasons(row);
    let model = if row.model.trim().is_empty() {
        None
    } else {
        Some(row.model.trim().to_owned())
    };

    if !row.raw_response.trim().is_empty()
        && let Ok(response) = serde_json::from_str::<Value>(&row.raw_response)
    {
        return Some(DebugCacheResponse::Raw {
            response,
            finish_reasons,
            model,
        });
    }

    let output = if !row.gen_ai_output.trim().is_empty() {
        Some(row.gen_ai_output.trim())
    } else if !row.output.trim().is_empty() {
        Some(row.output.trim())
    } else {
        None
    };

    if let Some(output_val) = output {
        if let Ok(messages) = serde_json::from_str::<Value>(output_val) {
            return Some(DebugCacheResponse::GenAi {
                messages,
                finish_reasons,
                model,
            });
        }
    }

    None
}

/// Resolve finish reasons from `gen_ai.response.finish_reasons` (array, preferred)
/// or `gen_ai.response.finish_reason` (single string, fallback).
fn resolve_finish_reasons(row: &DebugCacheSpanRow) -> Option<Vec<String>> {
    if !row.finish_reasons.trim().is_empty() {
        if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(&row.finish_reasons) {
            let strings: Vec<String> = arr
                .into_iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect();
            if !strings.is_empty() {
                return Some(strings);
            }
        }
    }
    if !row.finish_reason.trim().is_empty() {
        // JSONExtractRaw may return a quoted string ("stop") or a bare identifier.
        let s = if let Ok(Value::String(s)) = serde_json::from_str::<Value>(&row.finish_reason) {
            s
        } else {
            row.finish_reason.trim().to_owned()
        };
        return Some(vec![s]);
    }
    None
}

/// A warmed entry: the SDK-side input hash and the response envelope to replay.
#[derive(Debug)]
struct WarmEntry {
    input_hash: String,
    response: DebugCacheResponse,
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
/// A single span whose response alone exceeds `MAX_BYTES` can never be admitted,
/// so it is skipped (like an output-less span) and scanning continues toward the
/// needle, rather than aborting the whole warmup on one oversized span. The byte
/// ceiling only fires when an admissible span would push the *cumulative* total
/// over `MAX_BYTES`.
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
                let bytes = serde_json::to_string(&response).map_or(0, |s| s.len());
                // Span ceiling is a hard stop.
                if entries.len() >= max_spans {
                    return (entries, SelectionOutcome::CeilingHit);
                }
                // A response larger than the whole byte budget can never be
                // admitted — skip it (like an output-less span) and keep
                // scanning so smaller spans up to the needle still warm, rather
                // than aborting the entire warmup on one oversized span.
                if bytes <= max_bytes {
                    if total_bytes + bytes > max_bytes {
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
    let hashes = entries
        .iter()
        .map(|e| e.input_hash.clone())
        .collect::<Vec<_>>();
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
    match cache.get::<DebugCacheResponse>(key).await {
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
