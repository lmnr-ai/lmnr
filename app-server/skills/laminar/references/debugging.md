# Laminar Debugger

Use when building, testing, or debugging an LLM agent instrumented with Laminar. The debugger records each run as a trace, lets you replay cached LLM calls so you iterate fast and deterministically, and lets you annotate the session so a human can follow what you did. When the debugging turns into iterating on an eval score across many runs, also read [optimization.md](optimization.md) — the discipline layer for multi-iteration tuning.

## Your role

You are the **parent agent**: the coding agent doing the building. The **child agent** is the AI agent you are working on. You run the child agent under the debugger, read what happened, change its code or prompts, and run it again.

You own one thing the human relies on that the tooling can't do for you: **making the debug session legible.** You name the session and annotate it with markdown notes, because the human reads those notes — not the raw spans — to understand what you did and why. This is not optional. Treat it as part of every run.

## The core loop

1. **Record** — run the child agent under the debugger to capture a trace.
2. **Inspect** — query the trace to find what went wrong and where.
3. **Replay + edit** — change the code/prompt, then re-run replaying the cached calls up to the point of interest and running live past it.
4. **Annotate throughout** — name the session, and add notes as you go.

Each iteration only pays for the calls that actually changed.

## Prerequisites

- The child agent must be **instrumented with Laminar**. If it isn't yet, see [instrumentation-typescript.md](instrumentation-typescript.md) / [instrumentation-python.md](instrumentation-python.md).
- The **Laminar CLI** must work in your environment. See [cli.md](cli.md).

## 1. Record a run — `LMNR_DEBUG` just works

Prefix the child agent's normal run command with `LMNR_DEBUG=1`:

```bash
LMNR_DEBUG=1 python my_agent.py        # or node my_agent.js, or whatever the run command is
```

That's the whole setup. The run exports its spans as a trace and registers a debug **session** — a named group that every subsequent run joins automatically. Truthy values for `LMNR_DEBUG` are `true`, `1`, `yes`, `on`.

A session is a **timeline of blocks**: one block per trace, one per eval run, plus free-standing **text notes** you add. That's the unit the human reads.

**The session is persisted for you in `.lmnr/debug-session.json`.** You do not carry ids between runs by hand:

- The first debug run mints a session and writes the file. Every later `LMNR_DEBUG=1` run in the project **rejoins that same session silently** — so your runs stay grouped in the UI with zero extra flags.
- The file is found by walking **up** from the current directory to the nearest one that has it (same rule as `.lmnr/project.json`), so runs from a subdirectory still join the project's session.
- The file holds `session_id`, the last run's `trace_id`, `replay_trace_id`, `cache_until`, `debugger_url`, and `started_at`. **`session_id` is the single source of truth** — every session command reads it, so they default to "the session you're working on" without arguments.

**Evals join the same session too.** Running an eval under debug — `LMNR_DEBUG=1 npx lmnr eval evals/foo.eval.ts` — stamps the same `rollout.session_id` and lands in the session as an `evaluation` block, right next to your trace runs and notes. One session can interleave agent runs, eval runs, and notes; debug evals need no extra command or eval-session file. (Harbor environment evals, run with `lmnr-cli eval run`, are a separate workflow: see [env-evals.md](env-evals.md).)

To start a clean, named session at the top of an investigation, mint one explicitly (resets the file and opens the debugger page):

```bash
npx lmnr-cli debug session new
```

You rarely need anything else. The two escape hatches, for when you do:

- `LMNR_DEBUG_SESSION_ID=<id>` — pin a specific session, overriding the file.
- Each run prints one `LMNR_DEBUG_RUN ` line of JSON to the console (the same record as the file) if you want to capture ids programmatically with `grep`/`jq`.

## 2. Name the session and annotate it

This is your responsibility to the human, and it is mandatory. A session of unlabeled runs is unreadable. The commands default the session id from `.lmnr/debug-session.json`, so you normally pass only the payload (the name, the note); an explicit id is always a `--session-id` **flag**, never a positional.

**Name the session once**, describing the investigation:

```bash
npx lmnr-cli debug session set-name "Fix report length + search tool"
```

**Notes are standalone blocks on the session timeline** — you add them with `debug session add-note`, separately from the runs. The rhythm is: drop a note **before** a run to state what you're about to try, launch the trace, then drop another **after** to record what it showed. Each call adds a new text block, interleaved by time with the trace/eval blocks and keyed to the session — never glued to any one trace:

```bash
# Before the run — state your intent, then launch the trace.
npx lmnr-cli debug session add-note "## About to test
Replaying up to the search call, running synthesis live with the new length cap."

LMNR_DEBUG=1 node my_agent.js

# After the run — record what it showed.
npx lmnr-cli debug session add-note "## What this run showed
The <span id='<spanId>' name='synthesis call' /> now returns ~180 words (was ~600).
Length cap is working. Next: check that citations are still intact."
```

Notes take raw markdown (~20–200 words) — no JSON, no escaping, no hand-stringifying. Each `add-note` appends a new block rather than overwriting, so the timeline reads as a running commentary. It goes to the session in `.lmnr/debug-session.json` (override with `--session-id`), and works the same whether the session's runs are agent traces or evals.

**Span chips.** Embed a span tag in any note and the UI renders a clickable chip that opens that span:

```text
<span id='<spanId>' name='the synthesis call' />
```

- `id` is the span's UUID (the `span_id` from the SQL below); the span must belong to a trace in this session.
- `name` is the chip label (short free text).
- Optional `reference_text='…'` adds a muted inline preview: `<span id='<spanId>' name='synthesis' reference_text='~180 words, was ~600' />`.

**Re-orient after a context reset** by dumping the whole session timeline, oldest first:

```bash
npx lmnr-cli debug session summary          # add --json for structured output
```

Each entry is a `<trace id="…"/>` tag, an `<evaluation id="…"/>` tag, or a text note — the same blocks the UI shows, in order. Feed a trace id into the SQL below. To reopen the session in the browser (works offline): `npx lmnr-cli debug session open`.

## 3. Inspect the trace with SQL

Querying is faster and more precise than reading the UI. Every debug run stamps `rollout.session_id` on its trace, so you can filter to exactly your runs:

```sql
SELECT id AS trace_id, start_time, status, total_tokens
FROM traces
WHERE simpleJSONExtractString(metadata, 'rollout.session_id') = '<session-id>'
ORDER BY start_time DESC
LIMIT 10;
```

```bash
npx lmnr-cli sql query "SELECT id, start_time, status FROM traces ORDER BY start_time DESC LIMIT 20"
```

To locate a failure, read the trace's spans in order — which LLM call produced the bad output, what its inputs were, how far into the loop it happened. `input`/`output` columns are large, so select them only for the one span you care about:

```sql
SELECT span_id, name, span_type, start_time, status
FROM spans
WHERE trace_id = '<trace-id>'
ORDER BY start_time ASC;
```

`span_type` is one of `LLM`, `TOOL`, `DEFAULT`, or `CACHED` (a replayed LLM call in a replay run's trace). A replay boundary must point at an **LLM call along the loop** — tool executions can't be boundaries. List the loop's LLM calls to pick the one just before the call you want to run live (cached calls from a replay source count too):

```sql
SELECT span_id, name, start_time FROM spans
WHERE trace_id = '<trace-id>' AND span_type IN ('LLM', 'CACHED')
ORDER BY start_time ASC;
```

Discover the full schema with `npx lmnr-cli sql schema`. Useful tables: `spans`, `traces`, `signal_events`, `trace_outputs`. See [sql-query-api.md](sql-query-api.md) for more patterns.

### Signal events — recent errors and insights

`signal_events` records signals fired during runs (evaluation failures, flagged conditions, insights). Scan it to surface what recently went wrong without reading every trace:

```sql
SELECT timestamp, signal_name, severity, trace_id, substring(payload, 1, 2000) AS payload
FROM signal_events
WHERE timestamp > now() - INTERVAL 1 DAY
ORDER BY timestamp DESC
LIMIT 20;
```

`severity` is `0` INFO / `1` WARNING / `2` CRITICAL. Join back to the offending trace with `trace_id`, then drop into its spans.

`traces` also carries each trace's signal events and named failure clusters as array columns, which is the better read when you want to scan **your session's** runs specifically — the session filter and the signals land on the same row, no second query:

```sql
SELECT t.id AS trace_id, t.start_time, t.status,
       arrayMap(c -> c.name, arrayFilter(c -> c.level = 1, t.clusters)) AS clusters,
       arrayMap(e -> e.severity, t.signal_events) AS severities
FROM traces AS t
WHERE simpleJSONExtractString(t.metadata, 'rollout.session_id') = '<session-id>'
  AND t.start_time > now() - INTERVAL 7 DAY
  AND notEmpty(t.signal_events)
ORDER BY t.start_time DESC
LIMIT 20;
```

`clusters` on a trace includes each event's finest cluster plus its ancestors, hence the `level = 1` filter; [sql-query-api.md](sql-query-api.md#signals-and-clusters) has the full column shapes. `payload` is large, so `substring` it or read only the array length (`notEmpty` / `empty`).

## 4. Replay to iterate fast

After editing the child agent, re-run replaying the source trace's cached LLM calls instead of hitting the model. You set two ids — the source trace and the cache boundary; the session is still carried by the file:

```bash
LMNR_DEBUG=1 \
LMNR_DEBUG_REPLAY_TRACE_ID=<trace-id> \
LMNR_DEBUG_CACHE_UNTIL=<span-id> \
node my_agent.js
```

Calls inside the cache window return their recorded responses instantly; past it, the run goes live. **Replay needs both vars** — with either unset, the run is fully live.

- **`LMNR_DEBUG_REPLAY_TRACE_ID`** is the recorded trace to pull cached responses from (a `trace_id` from a prior run).
- **`LMNR_DEBUG_CACHE_UNTIL` is a span id** — replay *through* that span, inclusive: the named call comes from cache, the next one runs live. Accepts the span's full UUID, the last two UUID groups, the 16-hex OTel id, or any hex suffix — whatever you copied from SQL or the UI. (There is no numeric-count form.) A value that isn't span-id-shaped is ignored with a warning; a well-formed id that isn't a loop LLM call (an `LLM` or `CACHED` span — cached calls from a replay source count too) runs fully live.

**Cache key: `(trace_id, hash_of_inputs)`, and the hash excludes the system prompt.** So you can freely rewrite the system prompt between replay runs and still hit the cache. Changing anything else (first user message, tool outputs, model params) changes the hash and misses — and once one call misses, the run goes live for everything after it in that iteration.

### Special case: AI SDK (TypeScript)

For the [Vercel AI SDK](https://laminar.sh/docs/tracing/integrations/vercel-ai-sdk), caching needs one extra step on top of the normal telemetry integration: wrap each model with `wrapLanguageModel`. The wrapper is what hashes the span input and consults the Laminar backend for a cached response. Without it, your AI SDK calls are still traced and appear in the transcript, but they will **not** serve from cache during replay.

```typescript
import { generateText, gateway } from 'ai';
// or
import { anthropic } from '@ai-sdk/anthropic';
import { registerAiSdkTelemetry, wrapLanguageModel } from '@lmnr-ai/lmnr';

// AI SDK v7: register telemetry once at startup (this initializes Laminar too).
// On v5/v6 instead call Laminar.initialize() and pass
// experimental_telemetry: { isEnabled: true, tracer: getTracer() } on the call.
registerAiSdkTelemetry();

await generateText({
  // this line is what enables debugger caching
  model: wrapLanguageModel(gateway('openai/gpt-5')),
  // or
  // model: wrapLanguageModel(anthropic('claude-opus-4-5')),
  // ... other params
});
```

**The rhythm:** replay up to *just before* the suspect call → fix it → re-run that one call live, repeatedly. Then push the boundary *past* the change to validate the rest of the loop. Each iteration is a new trace under the same session, so attempts compare side by side — note each one. Replayed traces can themselves be replay sources.

Rejoining a session is **not** replay — the file's prior `trace_id` is never auto-replayed. Replay only happens when you set the two vars above (or the file already has both armed).

## What to keep in mind

- **Replay never blocks you.** If the cache can't be built (no clear loop, or parallel calls it can't sequence) the run silently falls back to fully live — a normal trace, just no speedup. Not an error.
- **Replay assumes a sequential agent loop.** Wildly parallel LLM fan-out won't replay cleanly; expected.
- **Restart what doesn't hot-reload.** A long-lived component that loads code (e.g. a Temporal worker) must be restarted after every edit, or your replay exercises stale code.
- **Move your boundary, not your whole approach.** Resist re-running fully live every time — avoiding that cost is the entire point of replay.
- **Turn it off** for production / normal runs by simply not setting `LMNR_DEBUG`. Everything is inert when it's unset.
