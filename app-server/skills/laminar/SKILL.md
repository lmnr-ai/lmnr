---
name: laminar
description: "Instrument code with Laminar tracing, run the Laminar CLI, query trace data with SQL, debug agents with record/replay, and migrate from other observability tools. Use when a user mentions Laminar, lmnr, the @lmnr-ai/lmnr or lmnr SDK, lmnr-cli, adding LLM/agent tracing or spans to a TypeScript or Python codebase, viewing traces in the Laminar UI, querying spans/traces/signal events/clusters, debugging an agent under LMNR_DEBUG (recording runs, replaying cached LLM calls, annotating debug sessions), building environment evals with Harbor (isolated containers running the real app, seeded per case from production data), or moving from Langfuse, LangSmith, Helicone, or OpenTelemetry to Laminar."
---

# Laminar

Laminar is an observability platform for LLM and agent applications. You instrument code so production runs become traces (trees of spans), then explore them in the UI or query them with SQL. This skill covers the SDKs (`@lmnr-ai/lmnr` for TypeScript, `lmnr` for Python), the `lmnr-cli` command-line tool, and the SQL Query API.

## Mental model

Read this before instrumenting anything — it drives every decision below.

- **One trace = one unit of work you want to analyze end-to-end** (a request, a turn, a job, a pipeline run).
- **A trace is a tree of spans.** Spans are typed (`LLM`, `TOOL`, `DEFAULT`, etc.). Types drive UI behavior — the transcript view is high-signal and focuses on `LLM` and `TOOL` spans.
- **Auto-instrumentation** captures supported LLM provider SDKs, agent frameworks, and browser libraries — each has its own setup guide at https://laminar.sh/docs/integrations. You still add first-party spans around your own orchestration so traces are readable.
- **Great traces have:** one clear root span per trace boundary; a few meaningful child spans for major steps; stable, low-cardinality names; context for filtering (`userId`, `sessionId`, metadata, tags); and privacy controls so secrets/PII are never recorded.

**Cardinality rule (applies everywhere):** never put dynamic IDs (request IDs, user IDs, document IDs) in span names or tags. Span names and tags stay stable and low-cardinality; identifiers go in metadata or the dedicated `userId`/`sessionId` fields.

## Choose your task

Read only the reference file(s) for the task at hand. Each is self-contained.

| The user wants to... | Read |
|----------------------|------|
| Add Laminar tracing to a TypeScript/JS/Node codebase | [references/instrumentation-typescript.md](references/instrumentation-typescript.md) |
| Add Laminar tracing to a Python codebase | [references/instrumentation-python.md](references/instrumentation-python.md) |
| Use `lmnr-cli` / `lmnr` CLI (setup, login, sql, datasets, debug sessions); for `lmnr-cli eval run` see env-evals.md below | [references/cli.md](references/cli.md) |
| Query traces, spans, signal events, or clusters with the SQL API | [references/sql-query-api.md](references/sql-query-api.md) |
| Migrate from Langfuse / LangSmith / Helicone / OpenTelemetry | [references/migration.md](references/migration.md) |
| Debug an agent: record under `LMNR_DEBUG`, replay cached LLM calls, annotate sessions | [references/debugging.md](references/debugging.md) |
| Run a production-failure fix-and-verify eval loop (record → eval → verify) inside a debug session | [references/eval-loop.md](references/eval-loop.md) |
| Iteratively optimize an agent against an eval score (prompt/pipeline tuning over many runs) — ALSO read whenever a debugging or eval-loop task turns into score-chasing | [references/optimization.md](references/optimization.md) |
| Build environment evals with Harbor and run them with `lmnr-cli eval run` (locally or `--remote`): the real app and services in isolated containers, each case seeded with (production-derived) data, the outcome graded | [references/env-evals.md](references/env-evals.md) |

The cross-cutting concepts shared by both SDKs — span context propagation, tags, metadata, sessions, privacy controls, custom LLM cost tracking, flushing — live in the two instrumentation files (one per language) so each is complete on its own.

## Workflow for instrumenting a codebase

Copy this checklist and track progress:

```
- [ ] 1. Detect runtime (TS vs Python) and the package manager (lockfile-based).
- [ ] 2. Install the SDK with the detected package manager.
- [ ] 3. Wire LMNR_PROJECT_API_KEY from env; add it to .env.example/README (never commit secrets).
- [ ] 4. Call Laminar.initialize() once, at the earliest safe startup point.
- [ ] 5. Identify the LLM SDKs/frameworks in use; fetch each one's guide from https://laminar.sh/docs/integrations and follow it.
- [ ] 6. Add first-party spans (observe / @observe) around orchestration; set user/session/metadata/tags early.
- [ ] 7. Apply privacy controls to sensitive inputs/outputs.
- [ ] 8. Run one representative flow; verify the trace tree, transcript view, and filters in the UI.
```

Ground rules:

- **Use the repo's existing package manager** (detect from lockfiles); never introduce a new one.
- **Keep diffs minimal** and aligned with existing code style. Don't refactor unless necessary.
- **In a monorepo,** install Laminar in the package(s) that actually run the traced code (server, worker, eval runner), not just the root.
- **Don't guess APIs.** If unsure, consult the reference file or ask. For exact, current package versions, query npmjs.com / pypi.org rather than relying on memory.
- **Avoid double-instrumentation** — never run two tracer SDKs that both instrument the same calls.

## Prerequisites for any task

- A Laminar **project API key** (dashboard → **Settings → Project API Keys**), set as `LMNR_PROJECT_API_KEY`, or mint one automatically with the CLI `setup` command [references/cli.md](references/cli.md)
- **Self-hosted Laminar:** also set the base URL. SDKs accept `baseUrl`/`base_url` (or `LMNR_BASE_URL`); local defaults are HTTP port `8000` and gRPC port `8001`. The CLI uses `--base-url http://localhost --port 8000`.

## Verify before declaring done

For instrumentation tasks, confirm in the UI: a single root span per trace boundary, child spans nested correctly, the transcript view reads cleanly (LLM/TOOL spans present), and tags/metadata are filterable. If traces are slow or missing in a short-lived script, flush — see the per-language reference.
