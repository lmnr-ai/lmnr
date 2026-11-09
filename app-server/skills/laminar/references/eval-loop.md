# Laminar eval loop

Turn production failures into a measurable fix-and-verify loop: read what's breaking from clusters/signals, replay it as an eval against the agent you're editing, and iterate until the failure mode clears. **This runs inside a debug session** — each iteration runs the eval under `LMNR_DEBUG`, so it lands as one `evaluation` block in the same session timeline as your debugger work. Read [debugging.md](debugging.md) first; this builds on it and reuses its session + note machinery. **If the loop runs more than a couple of iterations — you're optimizing a score, not verifying one fix — also read [optimization.md](optimization.md)**: the discipline layer (single-row spot-checks with guard rows; general fixes over case-specific ones) that keeps a multi-run arc honest.

**Document as you go.** Under the debug flag the session becomes a transcript the human reads and explores later, so journal what you tried and what you saw as you iterate — that's what keeps the loop legible (§4, §7).

## Your role

You're the **parent agent**; the **child agent** is what you're editing. You exercise the child over a fixed dataset of its own past failures and watch a score move. **You own session legibility** — each run must land as one readable `evaluation` block with a digest note, never a wall of per-datapoint traces.

**Ask for the stop threshold up front.** "Until what score / pattern should I stop?" — thresholds vary wildly by task (severity ≥ 0.85, "no new failure category", "highest reachable in N iterations"). Re-confirm if you cross 5 iterations without hitting it.

**Verify the metric is real before iterating.** Sample 2-3 failing rows (`target` + `executor_output` side by side) and confirm the per-row score is the one you'd compute by hand. A `_safe`-style decorator swallowing a KeyError scores 0.0 on every row and looks identical to "model is bad at this dimension."

## The loop

1. **Find the failure mode** — cluster `signal_events`, pick the cluster you're fixing (§1).
2. **Freeze a dataset** — pull failing traces' inputs once, reuse every iteration (§2).
3. **Write the eval** — executor calls the child; evaluators invert the signal; set a per-iteration `name` and a per-session `groupName` (§3).
4. **Note intent + launch** — `add-note` what you're changing and why, edit the child (one thing), run the eval (§4).
5. **Read cheaply** — scores first, then failing rows' inputs/outputs, then a full trace only if needed (§5).
6. **Diff** — this run vs the previous run in the same group (§6).
7. **Journal** — `add-note` what the run showed and what's next (§7).
8. **Stop** — target dimension ≥ threshold AND no new failure category vs baseline (§8).

## Two grouping keys — keep them separate

An eval run carries both, and neither derives from the other:

- **`group_id`** (eval's `groupName`) — a name for **this debug session's** iterations, chosen when you open the session (align it with the session's `set-name`). Keep it FIXED across every iteration in the session so the progression chart accumulates run-over-run; start a **new** group whenever you `debug session new`. It is NOT the cluster id.
- **`rollout.session_id`** — the debug session id from `.lmnr/debug-session.json`; ties the run's blocks to the session timeline.

## How the run lands in the session

The run stamps `rollout.session_id` on the **evaluation's** metadata (`evaluations.metadata`), so it lands as **one `evaluation` block** — not N per-datapoint traces. `debug session summary` reads these back.

- **TS:** `LMNR_DEBUG=1 npx lmnr eval` stamps it automatically from `.lmnr/debug-session.json`.
- **Python:** same, but export `LMNR_DEBUG=1` in the environment first, then run your eval.

## Prerequisites

- **Child agent is runnable from this codebase** (local function or callable endpoint). If you can't run it, you can't close the loop.
- **`lmnr-cli login`** ([cli.md](cli.md)) is done — this loop drives everything through the CLI. Not logged in? Run `npx lmnr-cli setup`. The CLI resolves the project from `.lmnr/project.json` OR a per-call `--project-id <uuid>`.
- **A debug session exists** — `npx lmnr-cli debug session new` mints one, registers it server-side, and writes `.lmnr/debug-session.json`; later `LMNR_DEBUG=1` runs and CLI calls rejoin it. Don't hand-write the file (skips registration → `summary`/`add-note`/`open` 404). If `new` only writes a local file (WARN + exit 0), the backend is unreachable — fix it before proceeding.
- **Project has recent traces.** §1 returns zero rows on a brand-new project — check with `sql query "SELECT count() FROM traces WHERE start_time > now() - INTERVAL 7 DAY"`. If empty, instrument first (<https://laminar.sh/docs/tracing/introduction>).

## Hard rules

- **Journal each run, not each datapoint.** Two `add-note` blocks per iteration — intent before the run, result after — never one per datapoint.
- **Always filter by `start_time` / `timestamp`** (ClickHouse scans the whole table otherwise).
- **SQL is SELECT-only, allowlisted.** `evaluation_trials` (alias `evaluation_datapoints`), `evaluations`, `traces`, `spans`, `signals`, `signal_events`, `signal_events_all`, `clusters`, `dataset_datapoints`, `datasets` are queryable; `debugger_sessions` is NOT (inspect via UI). `lmnr-cli sql schema` prints the live list.
- **Freeze the dataset, change one thing per iteration, keep `groupName` fixed for the session** (bump `name` per run) — or the diff is meaningless.
- **Adapt the aggregate SQL to your scorers.** Multiple evaluators (classification / severity / cost) each need their own `avg(simpleJSONExtractFloat(scores, '<name>'))` line; don't copy-paste a single-scorer template.

---

## 1. Find the failure mode

Rank the named failure clusters, reading them off `traces` so cost comes along for free:

```bash
npx lmnr-cli sql query "
  SELECT c.id AS cluster_id,
         c.name AS cluster,
         count() AS traces,
         round(sum(t.total_cost), 4) AS cost
  FROM traces AS t
  ARRAY JOIN t.clusters AS c
  WHERE t.start_time > now() - INTERVAL 7 DAY
    AND c.level = 1
  GROUP BY cluster_id, cluster
  ORDER BY traces DESC
  LIMIT 20" --json
```

Scope to one Signal with `AND c.signal_id = '<uuid>'`. The `level = 1` filter and the cluster column shapes are explained in [sql-query-api.md](sql-query-api.md#signals-and-clusters).

Then read a few payloads from the cluster you picked to see what the failures actually say — the payload is the event's content:

```bash
npx lmnr-cli sql query "
  SELECT trace_id, severity, substring(payload, 1, 2000) AS payload
  FROM signal_events
  WHERE has(leaf_clusters, toUUID('<cluster_id>'))
    AND timestamp > now() - INTERVAL 7 DAY
  LIMIT 10" --json
```

Note the `cluster_id` you're fixing. `signal_events` excludes L0 (unnamed, pre-naming) clusters; `signal_events_all` is the L0-inclusive sibling if you need them.

## 2. Freeze a dataset

One query: the traces in the cluster already carry their agent input.

```bash
npx lmnr-cli sql query "
  SELECT id AS source_trace_id, agent_input
  FROM traces
  WHERE arrayExists(c -> c.id = toUUID('<cluster_id>'), clusters)
    AND start_time > now() - INTERVAL 30 DAY" --json \
| jq -c '.[] | {
    data: (.agent_input | fromjson? // .agent_input),
    metadata: { source_trace_id: .source_trace_id, cluster_id: "<cluster_id>" }
  }' > data.jsonl

npx lmnr-cli dataset create <dataset-name> data.jsonl   # name it for what you're testing, e.g. report-quality-failures
```

`agent_input` is the extracted agent task / user input (the old `root_span_input`).

Targets are usually omitted: production traces have no gold label, so the evaluator checks a *property* (did the failure recur?), not exact match. **Build the dataset once and reuse it by name every iteration.**

## 3. Write the eval

Executor runs the child agent. Invert the signal into a pass/fail evaluator. Give the run a descriptive per-iteration `name` and a per-session `groupName` (see "Two grouping keys"):

```ts
import { evaluate, LaminarDataset } from '@lmnr-ai/lmnr';
import { runAgent } from '../src/agent';
import { detectsLoop } from './checks';

evaluate({
  data: new LaminarDataset('<dataset-name>'),
  executor: async (data) => runAgent(data),
  evaluators: {
    not_stuck_loop: (output) => (detectsLoop(output) ? 0 : 1),
  },
  // Per-iteration label — shows on the <evaluation> block in the session timeline.
  name: 'length-cap v2',
  // Per-session group — FIXED across this session's iterations; new one per session.
  groupName: 'report-quality-2026-07-03',
});
```

Bump `name` each iteration so every `evaluation` block is legible; keep `groupName` fixed for the whole session so the progression chart lines the runs up.

## 4. Launch the run

**Note your intent first**, as a session block, then launch the eval:

```bash
npx lmnr-cli debug session add-note "Capping synthesis at 200 words (report.ts:80-95) to compress the long-output tail driving the severity failures."

LMNR_DEBUG=1 npx lmnr eval evals/<eval-file>.eval.ts
```

Grab the `evaluation_id` from the printed link.

## 5. Read results — cheap first

```bash
# Aggregate (per scorer; adapt names)
npx lmnr-cli sql query "
  SELECT avg(simpleJSONExtractFloat(scores, 'not_stuck_loop')) AS avg_score,
         countIf(simpleJSONExtractFloat(scores, 'not_stuck_loop') < 1) AS failures,
         count(*) AS n
  FROM evaluation_trials
  WHERE evaluation_id = '<evaluation_id>'" --json
```

With `trials > 1`, these average over trials, so a task with more trials weighs more. The Laminar UI averages each task's trials first; to match it, wrap a `GROUP BY task_id` subquery.

**Failing rows — inputs and outputs side by side:**

```bash
npx lmnr-cli sql query "
  SELECT task_id, scores, data, target, executor_output
  FROM evaluation_trials
  WHERE evaluation_id = '<evaluation_id>'
    AND simpleJSONExtractFloat(scores, 'not_stuck_loop') < 1
  ORDER BY task_id, created_at" --json
```

**Full trace — last resort, one or two max:**

```bash
npx lmnr-cli sql query "
  SELECT name, span_type, status, input, output FROM spans
  WHERE trace_id = '<trace_id>' AND start_time > now() - INTERVAL 7 DAY
  ORDER BY start_time" --json
```

## 6. Diff against the previous run

```bash
npx lmnr-cli sql query "
  SELECT evaluation_id,
         any(evaluation_name) AS run,
         min(created_at) AS run_at,
         avg(simpleJSONExtractFloat(scores, 'not_stuck_loop')) AS score,
         countIf(simpleJSONExtractFloat(scores, 'not_stuck_loop') < 1) AS failures
  FROM evaluation_trials
  WHERE group_id = '<your session group>'
  GROUP BY evaluation_id ORDER BY run_at DESC LIMIT 2" --json
```

Improvement = score up / failures down. Also compare failing rows run-over-run: a category that wasn't there before is a regression you introduced.

## 7. Journal the run

The notes are the loop's changelog. After reading the scores, add a second block with what happened and why:

```bash
npx lmnr-cli debug session add-note "severity 0.733 -> 0.800 (+0.067), reasoning held, cost +\$0.001 — keep. 3/6 remaining failures are target=warning / output=info, so next tighten the info floor."
```

`npx lmnr-cli debug session summary` dumps the whole timeline oldest-first — the human's changelog.

**Replay caching may not apply.** If the agent under test runs server-side (you POST inputs to an endpoint), there's nothing local to cache — you get the session + journal layer, not replay. The per-iteration cost lever there is dataset size.

## 8. Stop

Stop when, on the frozen dataset: target dimension ≥ the user's threshold **and** no failing row describes a category that wasn't in the baseline. If you cross 5 iterations without hitting the target, surface the latest scores + remaining pattern and ask whether to keep going, lower the threshold, or stop.

---

## Schema you will touch

Full schema: `npx lmnr-cli sql schema`, or <https://laminar.sh/docs/platform/sql-editor#table-schemas>. Loop-relevant columns:

- **`signal_events`** — `trace_id`, `signal_id`, `signal_name`, `payload` (JSON string, large — wrap in `substring`), `severity` (0 INFO / 1 WARN / 2 CRIT), `timestamp`, `signal_version`, and the cluster columns `clusters`, `leaf_clusters`, `cluster_details`. Non-L0; `signal_events_all` for L0.
- **`traces`** — `id`, `metadata` (`rollout.session_id` for debug runs), `agent_input` (parse as JSON, fall back to string), `status`, `start_time`, `total_cost`, plus the `signal_events` and `clusters` array columns. Agent output messages live in `trace_outputs.agent_output`. Column shapes for both tables: [sql-query-api.md](sql-query-api.md#signals-and-clusters).
- **`evaluation_trials`** — one row per trial (one execution of a task). `evaluation_id`, `evaluation_name`, `group_id` (the per-session eval group = the eval's `groupName`), `task_id` (rows sharing it within an evaluation are trials of one task; compare runs on it), `data` / `target` / `executor_output` / `scores` / `metadata` (JSON strings; `scores` is `{name: number}`), `trace_id`, `trace_metadata` (mirrors the datapoint trace's metadata; note eval traces do NOT carry `rollout.session_id` — that lives on the evaluation entity, not the spans), `created_at`.
- **`spans`** — `trace_id`, `name`, `span_type`, `input` / `output`, `status`, `attributes` (JSON string), `start_time`.

JSON columns are guaranteed valid objects — use `simpleJSONExtract*` (fast) or `JSONExtract*` (nested) in-query. `input` / `output` / `agent_input` / `payload` may be raw strings; try JSON, fall back. Use `ILIKE` on `input` / `output`.
