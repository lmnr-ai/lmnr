# LAM-1715 — Debugger Cache v2: App-server component plan

> Read `00-shared-spec.md` first. This plan describes **only** the app-server
> (Rust) side. App-server owns the bulk of the new work: the cache endpoint,
> ClickHouse warmup query, server-side input hashing, Redis storage with a
> lock/TTL/background pagination, and the HIT/MISS/COLD response contract.

---

## 0. Files in play

| File | Role |
|------|------|
| `app-server/src/api/v1/rollouts.rs` | Add the new `POST rollouts/{session_id}/cache` handler next to the existing register/update/delete. |
| `app-server/src/api/v1/mod.rs` (or wherever the v1 scope is wired) | Register the new service. |
| `app-server/src/cache/keys.rs` | Add the debugger-cache key namespace + lock key. |
| `app-server/src/cache/mod.rs` (`CacheTrait`) | Reuse `get` / `insert_with_ttl` / `try_acquire_lock` / `release_lock` / `exists`. No new trait methods expected. |
| `app-server/src/traces/input_dedup.rs` | Reuse `canonical_json`; add a v2 whole-array hash helper (see §3). |
| `app-server/src/traces/prompt_hash.rs` | Reuse `extract_system_message`. |
| `app-server/src/ch/spans.rs` | Add a paginated query for a trace's LLM+CACHED spans with reconstructed input + output. |
| `app-server/src/db/spans.rs` | `SpanType` (LLM=1, Cached=8) source of truth. |
| New module e.g. `app-server/src/traces/debug_cache.rs` | Warmup + lookup orchestration (keep the handler thin). |

---

## 1. Endpoint

```rust
// rollouts.rs
#[post("rollouts/{session_id}/cache")]
pub async fn lookup_cache(
    path: web::Path<Uuid>,            // session_id
    project_api_key: ProjectApiKey,   // same extractor as register_session
    body: web::Json<CacheLookupRequest>,
    db: web::Data<DB>,
    cache: web::Data<Arc<Cache>>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult
```

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheLookupRequest {
    pub replay_trace_id: Uuid,
    pub cache_until: String,   // span-id needle (hyphen-stripped suffix match)
    pub input_hash: String,    // hex blake3, computed by the SDK
}
```

`session_id` is the debugger session (already registered). Auth is `ProjectApiKey`
→ `project_id`. The cache identity is `(project_id, replay_trace_id)` — **note:
`session_id` is not part of the cache key** (a session may replay; the trace +
project define the cache). `session_id` stays in the path for routing/consistency
with the sibling routes and for future per-session telemetry.

### Response shape (the three outcomes)

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum CacheLookupResponse {
    Hit { response: serde_json::Value },  // recorded output to replay
    Miss {},                              // warm, hash absent → SDK: run live forever
    Live {},                              // warmup timed out → SDK: run live THIS call only
}
```

Mapping to the spec's outcomes:
- **HIT** → `Hit { response }`.
- **MISS** (warm, hash absent) → `Miss {}`. The SDK sets its process-wide static
  flag and stops calling.
- **COLD** is **not** a response the SDK sees as "cold" — the handler **blocks and
  warms**, then returns `Hit`/`Miss` from the freshly warmed cache. The only time
  COLD surfaces to the SDK is when warmup exceeds the timeout, returned as
  `Live {}` (run live **this** call only, do **not** set the static flag, try again
  next call). This keeps MISS ≠ COLD on the wire: `Miss` = stop, `Live` = retry.

> Implementation note: returning HTTP 200 for all three with the discriminated
> `outcome` field is simplest for the SDK. Reserve non-200 for real errors (auth,
> malformed body, internal failure) — the SDK treats a transport/5xx error as
> `Live {}` semantics (run this call live, retry next) to avoid corrupting the
> replay on a transient blip, but that's an SDK concern.

---

## 2. Cache keys (`cache/keys.rs`)

```rust
pub const DEBUGGER_CACHE_KEY: &str = "debugger_replay_cache";   // entry map
pub const DEBUGGER_CACHE_READY_KEY: &str = "debugger_replay_ready"; // warm marker
pub const DEBUGGER_CACHE_LOCK_KEY: &str = "debugger_replay_lock";   // warmup lock
```

Concrete Redis keys are namespaced by `(project_id, replay_trace_id)`, e.g.:
- Ready marker: `{DEBUGGER_CACHE_READY_KEY}:{project_id}:{replay_trace_id}`
- Per-call entry: `{DEBUGGER_CACHE_KEY}:{project_id}:{replay_trace_id}:{input_hash}`
- Lock: `{DEBUGGER_CACHE_LOCK_KEY}:{project_id}:{replay_trace_id}`

**Storage layout decision (pick one, document it):**
- **(A) one key per call** — `...:{input_hash} → response_json`. Lookup is a single
  `cache.get`. Simple, scales to the cache ceiling without a giant value. **Preferred.**
- (B) one hash-map value per trace — `...:{replay_trace_id} → { input_hash: response }`.
  Atomic but a big value; partial/background warmup needs read-modify-write.

Go with **(A)**. Use the **ready marker** key to distinguish COLD (no marker) from
warm (marker present). A per-call MISS is "marker present but entry key absent".

TTL: a single configurable TTL on both the entry keys and the ready marker (e.g.
`DEBUGGER_CACHE_TTL_SECONDS`, default ~1 h). Background pagination must refresh /
re-set the marker TTL so it outlives a long warmup.

---

## 3. Server-side input hashing

For each kept span, app-server must compute **the same** `input_hash` the SDK
sends, so a lookup can match. Reuse the existing primitives:

```rust
// canonical_json: app-server/src/traces/input_dedup.rs  (already exists)
// extract_system_message: app-server/src/traces/prompt_hash.rs (already exists)

fn debug_input_hash(input: &serde_json::Value) -> String {
    // 1. input is the FULL reconstructed message array for the span (see §4.1).
    // 2. strip the system message:
    let messages = match extract_system_message(input) {
        Some((_system, remaining)) => remaining,   // remaining = array w/o system
        None => input.clone(),
    };
    // 3. canonicalize (sorted object keys, array order preserved) + blake3:
    let canonical = canonical_json(&messages);     // returns canonical String
    let hash = blake3::hash(canonical.as_bytes());
    hex::encode(hash.as_bytes())                    // 64-char hex
}
```

Match the SDK byte-for-byte:
- Same canonical JSON (object keys sorted recursively, arrays preserved).
- Same system extraction (first `role=="system"`, string/array/parts shapes).
- Same hex encoding of the 32-byte blake3 digest.
- **No number canonicalization** in v1 (documented limitation, §5.1 of the spec).

> ⚠️ This v2 whole-array hash is **distinct** from the per-message dedup hashing in
> `input_dedup.rs`. Do not reuse the per-message hash list — add a new small
> helper (above) that hashes the *entire* non-system array as one blob.

---

## 4. ClickHouse warmup query

### 4.1 The reconstruction subtlety (must-read)
Post-LAM-1608, dedup'd LLM spans store `spans.input` **empty**; the real input
lives in `spans.input_message_hashes` + `llm_messages`/`shared_content`, and is
**reconstructed by the `spans_v0` view** via dictionary lookups. **Warmup must read
the reconstructed input, not the raw `spans.input` column.** Two options:

- **Query `spans_v0`** (the view the frontend uses) which already reconstructs
  `input` / `output`. Simplest; confirm it exposes the columns we need
  (`span_id`, `span_type`/`span_kind`, `start_time`, reconstructed `input`, and
  the output-bearing attributes — see §4.3). **Preferred** if the view is reachable
  from app-server's CH client.
- Or query the raw `spans` table and replicate the dict reconstruction. More work;
  avoid unless `spans_v0` is unsuitable.

> Action item for the implementing agent: verify what app-server already queries
> (`ch/spans.rs` currently only has a `count(*)` against raw `spans`). The frontend
> reconstruction lives in `spans_v0`; pick the path that yields the **same** input
> bytes the SDK will hash. Whichever you choose, the hash must match the
> *normalized* stored input, which is the whole point of §9 (AI SDK) parity.

### 4.2 Pagination & ordering
```sql
SELECT span_id, span_type, start_time, <reconstructed input>, <output attrs>
FROM spans_v0
WHERE project_id = ? AND trace_id = ? AND span_type IN (1, 8)   -- LLM, CACHED
ORDER BY start_time ASC
LIMIT ? OFFSET ?
```
- Page size = `DEBUGGER_CACHE_QUERY_PAGE_SIZE` (default **8**, strict/small).
- Stop paging when: the `cache_until` span has been seen AND included, OR the
  cache ceiling is hit, OR no more rows.

### 4.3 Output extraction (what to store as the replay response)
Per §8 of the spec, resolve the recorded output in priority order:
1. `lmnr.sdk.raw.response` attribute (raw provider response) if present.
2. else `gen_ai.output.messages` (+ `gen_ai.response.finish_reason`).

These are attribute keys (`GEN_AI_OUTPUT_MESSAGES` already exists in
`traces/span_attributes.rs`). Decide whether `spans_v0` surfaces them or whether to
select from the attributes blob (`JSONExtractRaw`) — mirror the trace-view
attribute-extraction approach. Store the chosen JSON as the `response` value.

### 4.4 `cache_until` resolution
Resolve the needle **server-side** against the fetched spans' `span_id`s:
suffix-match the hyphen-stripped lowercase span id (same matcher as the old
`matchSpanId`). Keep spans `[first .. matched]` **inclusive**; discard everything
strictly after. If the needle matches **no** span in the trace, treat the whole
fetched set as kept? **No** — that risks caching past the user's intent. Instead:
log a warning and warm with **zero** entries (every lookup becomes MISS → SDK runs
live). Document this; it's the safe degrade. (Alternatively the endpoint could
surface a distinct error; keep it simple with empty-warm for v1.)

---

## 5. Warmup orchestration, lock & background pagination

Single winner, single timed lock (spec §6.3):

```
on lookup(project, replay_trace_id, cache_until, input_hash):
  if ready_marker exists:
      # WARM
      entry = cache.get(entry_key(input_hash))
      return entry.map(Hit).unwrap_or(Miss)

  # COLD: block-and-warm
  if try_acquire_lock(lock_key, ttl = LOCK_TTL):
      # we are the winner
      warm_first_page()                 # foreground: ~8 spans, set entries
      set ready_marker (TTL)            # cache is answerable now
      spawn background: paginate rest up to ceiling, refresh marker TTL
      release_lock (or let it expire after full warm)
      # answer THIS request from what we have so far:
      entry = cache.get(entry_key(input_hash))
      return entry.map(Hit).unwrap_or(Miss)
  else:
      # someone else is warming — wait for ready_marker up to WARMUP_TIMEOUT
      if wait_for_ready(WARMUP_TIMEOUT):
          entry = cache.get(entry_key(input_hash))
          return entry.map(Hit).unwrap_or(Miss)
      else:
          return Live   # timed out → run this call live, retry next call
```

- `LOCK_TTL` (`DEBUGGER_CACHE_LOCK_TTL_SECONDS`) must comfortably exceed full
  warmup time; the lock covers the **entire** processing including background
  pagination (spec: "keep one lock with timeout for the entire processing even if
  background").
- `WARMUP_TIMEOUT` (`DEBUGGER_CACHE_WARMUP_TIMEOUT_SECONDS`, default **10**) bounds
  how long a *waiter* (non-winner, or the winner's own foreground warm) blocks
  before degrading to `Live`.
- **Never** return `Live` just because a hash is absent in a warm cache — that's
  `Miss`. `Live` is **only** the warmup-timeout path. (Spec §7.2 CRITICAL note.)
- Concurrency simplification accepted for v1: a waiter polls the ready marker on a
  short interval (e.g. 100–250 ms) up to the timeout. No pub/sub needed.

### Background pagination shape
Two acceptable implementations — pick the simpler that fits app-server's runtime:
- Winner warms first page synchronously, then `tokio::spawn`s the remaining
  pages (holding the lock until done). Other callers wait on the marker.
- Or warm **everything** synchronously within the winner's request if the trace is
  small (≤ one page); only spawn background when there's a second page. The first
  page already answers the common case.

Don't build a multi-writer merge protocol. One winner fills all entry keys.

---

## 6. Config / env knobs (all with defaults)

| Env var | Default | Meaning |
|---------|---------|---------|
| `DEBUGGER_CACHE_QUERY_PAGE_SIZE` | 8 | Spans per ClickHouse page during warmup (strict/small). |
| `DEBUGGER_CACHE_MAX_SPANS` | 256 | Cache ceiling — max spans admitted per `(project, trace)`. |
| `DEBUGGER_CACHE_MAX_BYTES` | 67108864 (64 MiB) | Cache ceiling — max total response bytes. |
| `DEBUGGER_CACHE_TTL_SECONDS` | 3600 | TTL on entry keys + ready marker. |
| `DEBUGGER_CACHE_LOCK_TTL_SECONDS` | 60 | Warmup lock TTL (covers full warm incl. background). |
| `DEBUGGER_CACHE_WARMUP_TIMEOUT_SECONDS` | 10 | Max wait before a blocked caller degrades to `Live`. |

Read once at boot (follow the `SPANS_CH_*` env pattern in `ch/mod.rs`). Page size
and ceiling are **separate knobs** — do not derive one from the other.

---

## 7. LITE / fallback behavior

- In `ENVIRONMENT=LITE` the `Cache` is the in-memory Moka variant; everything still
  works in a single process (the only mode where in-memory is correct). The
  distributed value of the server-side cache only materializes with real Redis, but
  the code path is identical via `CacheTrait`.
- `try_acquire_lock` / `exists` / `insert_with_ttl` already have in-memory
  implementations — no special-casing required.

---

## 8. Testing

- **Hash parity unit test** (most important): a fixed message array (with a system
  message) → assert the server `debug_input_hash` equals a known hex constant that
  the SDK tests also assert against. This is the cross-language parity vector —
  store it where both repos can copy it (mirror the existing `test/data/debug/*`
  convention used by the SDKs).
- `cache_until` suffix-match resolution (full UUID / last-two-groups / raw 16-hex /
  short suffix all resolve to the same span; inclusive boundary).
- Outcome matrix: COLD→warm→HIT, warm→MISS, duplicate-hash earliest-wins,
  needle-not-found → empty warm → MISS, warmup-timeout → `Live`.
- Ceiling enforcement (spans and bytes) and page-size paging.
- Run with `cargo test --bin app-server -- --nocapture`.

---

## 9. Sequencing for the implementing agent

1. Add env knobs (`ch/mod.rs` pattern) + `cache/keys.rs` constants.
2. Add `debug_input_hash` helper (reuse `canonical_json` + `extract_system_message`).
3. Add the paginated CH query (decide `spans_v0` vs raw + reconstruct — §4.1).
4. Add `debug_cache.rs`: warmup (with ceiling + pagination), lock/ready-marker,
   lookup, outcome resolution.
5. Add the `lookup_cache` handler + register it in the v1 scope.
6. Tests, esp. the hash-parity vector shared with the SDKs.

> Land this **before** the SDK plans depend on a running endpoint, OR stub the
> endpoint contract from this doc so SDK work proceeds in parallel against the
> documented response shapes.
