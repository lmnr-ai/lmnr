# LAM-1715 — Debugger Cache v2: Shared Specification

> **Status:** design / not yet implemented.
> **Audience:** every agent working on any component of this change (app-server,
> TS SDK, Python SDK). Read this whole file first — it is the single source of
> truth for the contract that the components share. Component plans
> (`01-app-server.md`, later `02-ts-sdk.md`, `03-python-sdk.md`) only describe how
> each side fulfils the contract defined here.

---

## 1. Purpose & motivation

The debugger lets a coding agent **replay** a previously recorded agent run: as
the user's program re-executes, each live LLM call is transparently served from a
cached response captured on the original ("source") trace, up to a user-chosen
stopping point. Everything after the stopping point runs live. This lets an agent
iterate on the *tail* of a long agent run without paying to re-run (and without
the nondeterminism of re-running) the prefix.

### Why v2 replaces v1

v1 did this **entirely inside the SDK**:

- On init the SDK fetched the source trace's spans, ran a **spine-detection**
  heuristic (shallowest looping span path, overlap guard, etc.) to find the
  linear sequence of LLM calls, built an **in-memory** cache, and served cached
  responses by **occurrence index** (the Nth call on the spine path).
- `LMNR_DEBUG_CACHE_UNTIL` accepted either a count `N` or a span id; the span id
  was resolved against the spine to an occurrence count.

This breaks down badly:

1. **Distribution.** An in-memory, in-process cache cannot serve an agent whose
   work is spread across Temporal activities, Lambda invocations, or Cloudflare
   Workers. Each worker is a fresh process with an empty cache.
2. **Fragility.** Spine detection + occurrence-index addressing is clumsy and
   guesses at structure. It silently mis-serves when the real call graph doesn't
   match the heuristic (overlapping calls, branchy paths, etc.).
3. **The interface changed.** The coding-agent interface is now simply *"the span
   id to stop at"*. Given that, the natural model is: cache **all** spans up to
   that span id (ordered by timestamp), keyed by the **input** of each call.

### v2 in one sentence

Move the cache **server-side** (Redis, shared across replicas) and look it up
**per LLM call by a hash of that call's input**, warming the cache lazily on the
first call of a replay.

The added per-call latency (one HTTP round-trip to app-server, Redis lookup) is
acceptable.

---

## 2. Terminology

| Term | Meaning |
|------|---------|
| **Source trace** | The original recorded run being replayed. Identified by `replay_trace_id`. |
| **Replay run** | The new execution that serves cached responses from the source trace. |
| **Spine** (v1 only) | The heuristic linear sequence of LLM calls. **Removed in v2.** |
| **`cache_until`** | A **span id** (needle) on the source trace. The last call to be served from cache; everything strictly after it runs live. **Inclusive** of the matched span. |
| **Input hash** | `blake3` over canonical JSON of a call's input messages, **excluding the system message**. The cache key for a single call. |
| **Cache warmup** | App-server fetching the source trace's cached spans from ClickHouse and loading them into Redis. Happens lazily on first request for a given `(project, replay_trace_id)`. |
| **HIT / MISS / COLD** | The three outcomes of a cache lookup. See §7. |

---

## 3. What is removed vs added vs preserved

### Removed
- **Spine detection** in both SDKs (`spine.ts` / `spine.py` and their tests/vectors).
- **Occurrence-index ("count N") addressing.** `LMNR_DEBUG_CACHE_UNTIL` no longer
  accepts an integer count — **only a span id**. The `{ cacheUntil: number }`
  representation, occurrence counters, `resolveCacheUntilSpanId` → 1-based index,
  and `ReplayCache.slice(0, cacheUntil)` are all gone.
- The entire **SDK-local in-memory cache** (`replay-cache.ts` / `replay_cache.py`)
  and the SDK-side source-trace fetch (`source-trace.ts` / `source_trace.py`).
- The SDK overlap guard (`hasOverlap`) — overlap is no longer the SDK's concern.

### Added
- **App-server cache endpoint(s)** under `/v1/rollouts/{session_id}/cache` (§6).
- **SDK client resource(s)** that POST to the endpoint before each live LLM call
  and interpret HIT / MISS / COLD (§7).
- **Input hashing on the SDK**, reproducing app-server's `canonical_json` +
  `blake3` primitives, with **system-message exclusion** and **canonical key
  ordering** (§5). Must hash the *exact same payload* that app-server hashes from
  the ClickHouse-stored span.

### Preserved (do NOT change)
- The **run pointer** mechanism: the `LMNR_DEBUG_RUN <json>` stdout line, the
  `${cwd}/.lmnr/last-run.json` file, `LMNR_DEBUG_FROM_LAST_RUN`, and the
  persisted-metadata key **`rollout.session_id`** (intentionally not renamed to
  `debug.session_id`).
- The existing rollout session registration: `POST /v1/rollouts/{session_id}`
  (idempotent upsert, returns `{ sessionId, projectId }`), `DELETE`, the
  `debugger_sessions` Postgres table, `ProjectApiKey` auth.
- The debugger session URL surfaced to the coding agent.

### Explicitly **out of scope** (no changes)
- **No frontend changes.** This is a pure SDK ⟷ app-server change. There is no new
  UI, no new view, no frontend route. Do not touch `/repos/lmnr/frontend`.

---

## 4. Environment contract (SDK side)

A debug run is still just a process started with `LMNR_DEBUG*` env vars. Replay is
active when **both** of these resolve to non-empty:

- `LMNR_DEBUG_REPLAY_TRACE_ID` — the source trace id.
- `LMNR_DEBUG_CACHE_UNTIL` — **a span id needle** (full UUID, last-two UUID
  groups, raw 16-hex OTel id, or a short hex suffix — all suffix-match the
  hyphen-stripped source span id, same as v1's span-id form).

`LMNR_DEBUG` alone (no replay trace id / cache_until) is still a valid
"debug-no-replay" run: it registers a session and emits the run pointer but does
**not** install replay.

`LMNR_DEBUG_FROM_LAST_RUN` still seeds `replay_trace_id` / `session_id` /
`cache_until` from `.lmnr/last-run.json`, with individual env vars overriding.

> **Parity note:** the truthy set `["true","1","yes","on"]`, the pointer field
> order, and `CONSOLE_PREFIX = "LMNR_DEBUG_RUN "` stay byte-identical across SDKs.

---

## 5. The cache key: canonical input hash

Each LLM call is addressed by a **single 32-byte hash** of its input messages.

```
input_hash = hex( blake3( canonical_json( messages_without_system ) ) )
```

### 5.1 `canonical_json`
Reproduce app-server's `canonical_json` (`app-server/src/traces/input_dedup.rs`):

- **Objects:** keys sorted lexicographically (recursively).
- **Arrays:** order **preserved** (never sorted).
- **Scalars:** serialized via the language's `serde_json::to_string` equivalent.
- The whole `messages` array is hashed as **one blob** (NOT per-message — v2
  hashes the entire non-system message array for a call, distinct from the
  per-message dedup hashing app-server does for storage).

> **Number canonicalization is deferred.** Most inputs are strings; we are not
> normalizing numeric formatting (e.g. `1.0` vs `1`) in v1. Document this as a
> known limitation. If a future need arises, define it in this spec first and
> apply it on both SDK and app-server in lockstep.

### 5.2 System-message exclusion
Before hashing, strip the **system message** from the array. Reproduce
app-server's `extract_system_message` (`app-server/src/traces/prompt_hash.rs`):
find the first `role == "system"` entry, handle string / array / parts content
shapes, and hash only the **remaining** messages.

**Why:** the same logical call across two runs may carry a different system
prompt (the coding agent edits its own system prompt between iterations). Caching
must survive that, so the system message must not participate in the key.

### 5.3 The parity hazard: what exactly is hashed
The hash input MUST be **the same payload on the SDK and the payload stored in
ClickHouse** for that span. For most providers the SDK sees the same message
array that app-server reshapes into `spans.input`. **The exception is the Vercel
AI SDK** (`ai.prompt.messages`), which app-server reshapes via
`input_chat_messages_from_json` before storing. To keep the SDK's hash matching
the server's, the **TS SDK reproduces that normalization** before hashing — see
§9. **Resolution chosen: Option A** — port the reshape into the TS SDK; revisit
(and possibly drop) once everything is on AI SDK v7+ where the SDK controls span
content directly.

---

## 6. Server-side cache model

### 6.1 Identity
A cache entry set is identified by **`(project_id, replay_trace_id)`**. Within
that set, individual call responses are keyed by **input hash** (§5).

### 6.2 What is cached
All spans of the source trace with `span_type ∈ { LLM (1), CACHED (8) }`, ordered
by `start_time` ascending, **up to and including** the span matched by
`cache_until`, then everything **strictly after** that span is **discarded**.

> **Wording care (this confused an earlier draft):** the `cache_until` span IS
> cached. We keep `[first … cache_until]` inclusive and drop `(cache_until … end]`.
> "Cutoff inclusive" means *the cutoff is kept*, not dropped.

For each kept span we store its **input hash → recorded output**. The recorded
output is the response to replay (see §8 for which attribute).

### 6.3 Warmup, pagination, and the two separate size knobs
Warmup fetches the source trace's `LLM`+`CACHED` spans from ClickHouse and loads
them into Redis. Two **independent, separately-configurable** limits govern this —
do not conflate them:

| Knob | Governs | Default | Notes |
|------|---------|---------|-------|
| **Spans-query page size** | How many spans each ClickHouse `SELECT` pulls per page during warmup. | **~8** (small / strict) | This is a tight pagination chunk to keep each query cheap. Env-configurable. |
| **Cache ceiling** | Max total spans (and max total bytes) admitted into the Redis entry set for one `(project, replay_trace_id)`. | **256 spans / 64 MiB** (generous) | A safety cap on the whole cache, independent of the per-page size. Env-configurable. |

The query page size is **much stricter** than the cache ceiling on purpose: we
page in small batches but allow a comparatively large total cache.

#### Background / streamed warmup (optional optimization)
To minimize the blocking window on the very first call, warmup MAY proceed in two
phases:
1. **Foreground:** warm the cache with the **first page** (first ~8 spans by
   start_time) and answer the triggering request from those.
2. **Background:** continue paginating the rest of the cache (up to the ceiling)
   in the original request handler / a spawned task.

Keep the locking **simple** — do not overcomplicate:
- Assume **one request wins** the warmup. Use **one lock** (with a timeout)
  covering the **entire** processing, even when pagination continues in the
  background. Other concurrent first-callers wait on COLD handling (§7) until the
  cache is marked ready (or partially-ready enough to answer).

(The app-server plan picks the concrete locking shape; this section only fixes the
constraints: single winner, single lock, lock has a timeout, don't build a
multi-writer coordination scheme.)

---

## 7. Endpoint contract & the three outcomes

### 7.1 Endpoint
```
POST /v1/rollouts/{session_id}/cache
Auth: ProjectApiKey (same extractor as the existing rollout routes)
Body: {
  "replay_trace_id": "<uuid>",
  "cache_until":     "<span-id needle>",
  "input_hash":      "<hex blake3 of this call's non-system messages>"
}
```
Path keeps the existing **`rollouts`** prefix (confirmed — do not invent a new
top-level path).

### 7.2 Outcomes

The SDK makes one call **before each live LLM call**. The response is exactly one
of three outcomes:

1. **HIT** — the warm cache contains `input_hash`. App-server returns the recorded
   output for that call. The SDK serves it **in place of** the live call. (No live
   provider request happens.)

2. **MISS** — the cache is **warm** for `(project, replay_trace_id)` but does
   **not** contain `input_hash`. Semantics: *we have passed the end of the cached
   region (or this call diverged from the source run)* — there are no more cached
   responses to serve. App-server returns a **"run live from now on"** signal. The
   SDK records this in a **process-wide static flag** on the `Laminar` class and,
   from then on, **stops calling the endpoint** and runs every call live.
   - Accepted v1 limitation: distributed workers each make **one** endpoint call
     that returns MISS before they flip their own static flag. That single extra
     call per worker is fine.

3. **COLD** — the cache is **not yet warm** for `(project, replay_trace_id)` (first
   ever call, or warmup still in progress). App-server **blocks the request while
   it warms the cache** (now paginated and quick), then answers HIT/MISS from the
   freshly warmed cache. Only if warmup exceeds a **configurable timeout
   (default ~10 s)** does the endpoint give up and tell the SDK to run live for
   *this* call.

> **CRITICAL — do not run live on a plain COLD.** An earlier draft suggested "on
> cold, run the call live but don't set the flag." That is **wrong**: a live
> response will almost certainly differ from the source-trace response, and since
> subsequent calls' input hashes are computed over message history that now
> contains this (divergent) response, running live mid-replay **corrupts the input
> hash key on every following call** and silently breaks the rest of the replay.
> Therefore COLD must **block-and-warm**, not run live. Running live is only the
> last-resort behavior **after the warmup timeout elapses** — at which point the
> replay is already degraded and we fail loud / degrade to live deliberately.

> **MISS vs COLD must never be conflated.** "Is this trace in the cache at all?"
> (COLD → still warm it up) is a different question from "is this call past the
> cached region / divergent?" (MISS → stop asking, run live forever). One signal
> that merges them would either re-warm forever or stop replay prematurely. Keep
> them distinct in the response.

### 7.3 The static "run live" flag (SDK)
- Process-wide (static field on `Laminar`), set on the **first MISS**.
- Once set: skip the endpoint entirely, run every call live.
- Reset on `Laminar.shutdown()` (alongside the other debug-runtime resets) so a
  later `initialize()` starts clean.

---

## 8. What output is cached / replayed

Cache the **output only** (we serve a recorded response in place of a live one).
For each kept span the recorded response is resolved in priority order:

1. **`lmnr.sdk.raw.response`** — the raw provider response, if present. Preferred
   because it round-trips through the provider SDK's own response type most
   faithfully.
2. Otherwise **`gen_ai.output.messages`** + the finish reason
   (`gen_ai.response.finish_reason`) — the OTel GenAI semconv shape.

The SDK reshapes the recorded output back into the provider-native response object
the call site expects (per-provider; covered in the SDK component plans).

### Duplicate input hashes on the source trace
If two kept spans share the same `input_hash` (the agent made the identical call
twice), the **earliest by `start_time` wins**. Document this clearly; it is a
deliberate, simple rule (v1's occurrence indexing is exactly what we're removing,
so we do **not** try to disambiguate by occurrence).

---

## 9. AI SDK normalization parity (TS SDK only)

`ai.prompt.messages` (Vercel AI SDK) is a JSON string that app-server reshapes
into Laminar `ChatMessage[]` via `input_chat_messages_from_json` (`spans.rs`)
**before** storing/hashing. For the SDK's input hash to match the server's, the
**TS SDK reproduces that reshape + the §5.2 system extraction** before hashing.

- **Option A (chosen):** port the reshape into the TS SDK. Keep it entirely in the
  TS SDK — do **not** change app-server's normalization to accommodate the SDK.
- AI SDK **v7/v4** the SDK controls span content directly (easier); **v6/v3**
  needs the `ai.prompt.messages` reshape study. This is the trickiest SDK surface.
- Revisit once everything is on v7+; we may then drop the ported reshape.

Python SDK providers (anthropic / openai / google_genai / litellm) send message
arrays that already match the stored shape — no AI-SDK-style reshape needed there.

---

## 10. Cross-cutting invariants checklist

- [ ] SDK input hash == app-server hash of the same span's stored input (system
      excluded, canonical key order, array order preserved).
- [ ] `cache_until` is **span-id-only**, suffix-matched, **inclusive** of the
      matched span.
- [ ] Cache identity is `(project_id, replay_trace_id)`; entries keyed by input
      hash; includes `CACHED` (8) spans alongside `LLM` (1).
- [ ] Three distinct outcomes HIT / MISS / COLD; MISS ≠ COLD.
- [ ] COLD blocks-and-warms with a configurable timeout; **never** runs live
      before the timeout.
- [ ] MISS sets a process-wide static flag → stop calling the endpoint.
- [ ] Spans-query page size (~8) and cache ceiling (256 / 64 MiB) are **separate**
      env knobs.
- [ ] Single warmup winner, single lock with timeout.
- [ ] Output-only caching; `lmnr.sdk.raw.response` preferred, else
      `gen_ai.output.messages` + finish reason.
- [ ] Duplicate input hashes → earliest `start_time` wins.
- [ ] No frontend changes.
- [ ] Run pointer + `rollout.session_id` metadata key preserved.

---

## 11. v1 scope boundary

Accepted for v1 (do not over-engineer around these):
- One redundant MISS call per distributed worker before its static flag flips.
- No number canonicalization in the input hash.
- Earliest-wins on duplicate input hashes (no occurrence disambiguation).
- Background pagination uses a single winner + single timed lock (no multi-writer
  coordination).
- Warmup-timeout fallback to live is a deliberate degrade, not a happy path.
