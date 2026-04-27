# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Laminar is an open-source observability platform for AI agents. It provides OpenTelemetry-native tracing, evaluations, AI monitoring, and SQL access to all data.

## Repository Structure

This is a multi-service monorepo with three main components:

- **app-server/** - Rust backend (Actix-web HTTP, Tonic gRPC)
- **frontend/** - Next.js/TypeScript web UI
- **query-engine/** - Python gRPC service for SQL query processing

## Development Commands

### Frontend (Next.js)

```bash
cd frontend
pnpm install                    # Install dependencies
pnpm run dev                    # Start dev server with Turbopack
pnpm lint                       # Check linting
pnpm lint:fix                   # Auto-fix linting issues
pnpm format:write               # Format code with Prettier
pnpm type-check                 # TypeScript type checking
pnpm test                       # Run tests (tsx --test tests/**/*.test.ts)
pnpm build                      # Production build
```

### Backend (Rust)

```bash
cd app-server
cargo r                         # Run in development mode
cargo build --release           # Production build
cargo test -- --nocapture       # Run tests
```

### Query Engine (Python)

```bash
cd query-engine
uv sync                         # Install dependencies
uv run python server.py         # Run gRPC server
uv run pytest                   # Run tests
```

## Local Development Setup

### Environment setup:
```bash
cp .env.example .env
cp frontend/.env.local.example frontend/.env.local
```

### Minimal Working Setup

**PostgreSQL**, **ClickHouse**, and **Query Engine** are required. Other services have automatic fallbacks:

| Service      | Required | Fallback when not configured |
|--------------|----------|------------------------------|
| PostgreSQL   | Yes      | None                         |
| ClickHouse   | Yes      | None                         |
| Query Engine | Yes      | None                         |
| RabbitMQ     | No       | In-memory queue (TokioMpsc)  |
| Redis        | No       | In-memory cache (Moka)       |
| Quickwit     | No       | Search disabled gracefully   |
| S3 Storage   | No       | MockStorage                  |

### Docker-based development

**Frontend-only** (uses pre-built app-server image):
```bash
docker compose -f docker-compose-local-dev.yml up
cd frontend && pnpm run dev
```

**Full-stack with all services:**
```bash
docker compose -f docker-compose-local-dev-full.yml up  # All dependencies
cd app-server && cargo r                                 # Terminal 1
cd frontend && pnpm run dev                              # Terminal 2
cd query-engine && uv run python server.py               # Terminal 3
```

## Architecture

```
Frontend (5667) ─────────────────────────┐
                                         │
App Server                               │
├─ REST API (8000)  ◄────────────────────┘
├─ gRPC ingestion (8001) ◄─── SDK traces
└─ Realtime SSE (8002)
         │
         ├──► PostgreSQL (5433) - main database [required]
         ├──► ClickHouse (8123) - analytics/spans [required]
         ├──► RabbitMQ (5672) - async processing [optional, has in-memory fallback]
#        ├──► Query Engine (8903) - SQL processing [required]
         └──► Quickwit (7280/7281) - full-text search [optional]
```

## Database Migrations

Database schema is managed with Drizzle ORM. The source of truth is the database itself - do NOT edit schema files directly.

```bash
cd frontend
npx drizzle-kit generate        # Generate migrations after manual DB changes
# Migrations are applied automatically on frontend startup
```

- `pnpm schema-pull:lint` heavily reformats `schema.ts`, `relations.ts`, and `tsconfig.json`. After running it, revert unrelated formatting changes before committing.
- `npx drizzle-kit generate` requires a TTY for interactive prompts. In non-interactive shells (CI, sandbox), write migration SQL files and `_journal.json` entries manually.
- When writing migrations manually, also create a `meta/NNNN_snapshot.json`. Copy the previous snapshot, apply the schema change (e.g. add/remove columns), set `prevId` to the previous snapshot's `id`, and generate a new UUID for `id`. Without a snapshot, the next `drizzle-kit generate` will produce a duplicate migration.
- **ClickHouse migrations** (`frontend/lib/clickhouse/migrations/`) are tracked by the migration tool and only run once. Never modify an already-applied migration file — changes won't execute on existing deployments and may cause checksum errors. Always create a new numbered migration file instead.

## OTel GenAI Semantic Convention Ingestion

- **Backend (app-server)** preserves the native OTel GenAI message shape end-to-end — `gen_ai.input.messages` / `gen_ai.output.messages` are deserialised from JSON string to `Value` but NOT reshaped into Laminar's `ChatMessage` struct. This keeps the original instrumentation payload lossless; the frontend owns rendering. Do NOT reintroduce a backend ChatMessage conversion here — this was explicitly reverted in favour of keeping the raw shape.
- `gen_ai.system_instructions` is prepended to the input messages as a synthetic `{role: "system", parts: [...]}` entry so the system prompt threads into the same message array. Bare-string arrays (`["Be helpful"]`) are preserved verbatim inside `parts` — the frontend parser handles both shapes. Helper: `prepend_system_instructions` in `spans.rs`.
- **Frontend parser** lives at `frontend/lib/spans/types/gen-ai.ts` (`parseGenAIMessages`). It runs in `processMessages` (`frontend/components/traces/span-view/messages.tsx`) AFTER the OpenAI/Anthropic/LangChain/Gemini detectors and decodes the GenAI parts (`text|thinking|tool_call|tool_call_response|uri|blob`) into `ModelMessage[]` for the existing generic renderer.
- Span-type inference from `gen_ai.operation.name`: `chat|text_completion|embeddings|generate_content` → LLM, `execute_tool` → Tool, `invoke_agent` → Default.
- **pydantic_ai tool-span quirk**: pydantic_ai emits `execute_tool <name>` spans WITHOUT `gen_ai.operation.name`; only `gen_ai.tool.call.arguments` / `gen_ai.tool.call.result` are set. `span_type()` has a fallback that classifies a span as Tool when either of those attributes is present. Do not remove this fallback when adding other GenAI emitters.
- The `gen_ai.tool.call.*` → `self.input`/`self.output` block in `parse_and_enrich_attributes` is gated on `self.span_type == SpanType::Tool` (not just the raw attribute keys) so it cannot clobber LLM-span input/output if a spec-violating emitter mixes LLM message attrs with tool-call attrs on the same span. The gate still works for pydantic_ai because `span_type()` already infers Tool from the `gen_ai.tool.call.*` fallback before this runs.

## Signals and Alerts

- Alerts reference signals via `alerts.source_id`. There is NO FK constraint from `source_id` to `signals.id` because `source_id` may reference other entity types in the future. When deleting signals, associated alerts must be deleted in application code within the same transaction (see `deleteSignal`/`deleteSignals` in `frontend/lib/actions/signals/index.ts`).
- The Signals sidebar item is behind a feature flag (`Feature.SIGNALS`) which requires `GOOGLE_GENERATIVE_AI_API_KEY` or AWS Bedrock credentials to be set.
- Alert metadata is stored as JSONB in `alerts.metadata`. For `SIGNAL_EVENT` alerts, it contains `{severity: 0|1|2}` (info/warning/critical). The Rust backend reads this in `postprocess.rs` to filter events by severity threshold, defaulting to CRITICAL (2) when metadata is absent (historical alerts default to the most restrictive level). The frontend edit form also defaults to CRITICAL for alerts without metadata.
- Creating a signal auto-creates a CRITICAL-severity alert and subscribes all workspace member emails as alert targets.
- The `NEW_CLUSTER` alert type and the `skipSimilar` metadata option depend on the clustering service. Gate both the auto-creation of `NEW_CLUSTER` alerts in `createSignal` and UI affordances in `manage-alert-sheet.tsx` behind `isFeatureEnabled(Feature.CLUSTERING)` / `useFeatureFlags()[Feature.CLUSTERING]`. When clustering is disabled, force `skipSimilar: false` on submit so the backend doesn't silently drop notifications.
- In `manage-alert-sheet.tsx`, the `severities` Controller uses `shouldUnregister`. When its render condition (`selectedSignal && alertType === SIGNAL_EVENT`) flips to false — e.g. after a successful save resets `selectedSignal` — react-hook-form removes the field from form state and `watch("severities")` returns `undefined`. Any `useMemo` that reads `watch`ed values must null-check them (don't call `.length`/`.map` directly) or it will throw synchronously and break the whole page into the error boundary.
- Alert Slack targets persist a channel `id` in `alertTargets.channelId` and the display name in `alertTargets.channelName`. Both columns are populated for every row written by the form, so `resetFormFromSignals` in `manage-alert-sheet.tsx` filters to rows where both are present and uses them directly — no name-as-id healing needed.
- `getSlackChannels` in `frontend/lib/actions/slack/index.ts` paginates through Slack `conversations.list` via `response_metadata.next_cursor` (limit=500/page) and returns `{ channels, rateLimited }`. On rate-limit (HTTP 429 OR a 200 OK with `{ok:false, error:"ratelimited"}`) it does NOT retry — it returns whatever was collected so far with `rateLimited: true`. The consumer (`manage-alert-sheet.tsx`) toasts when `rateLimited` is true so the user knows the list may be incomplete. We don't cache — each request fetches fresh so new/renamed channels appear immediately. The picker (`slack-channel-picker.tsx`) leverages cmdk's `Command` for filtering with a custom `filter` that scores against the channel name (passed via `keywords`); `value` holds the channel id so duplicate names aren't possible.
- The `types` query parameter on `conversations.list` must include both `public_channel,private_channel` — dropping `private_channel` silently breaks existing alert targets that point at private channels (they disappear from the picker and can't be re-selected).

## Signal Triggers

- Signal trigger filters are evaluated in `app-server/src/db/trace.rs` (`matches_filters` / `evaluate_single_filter`). Spans arrive in batches, so filter evaluation must check accumulated state from the DB (e.g. `trace.span_names`) — not just the current batch's raw spans. The `traces.span_names` JSONB column aggregates span names across all batches via `||` merge on upsert.
- Trigger evaluation flow: `process_span_messages` → `upsert_trace_statistics_batch` (returns merged DB trace) → `check_and_push_signals` → `matches_filters`. All filters use AND logic.
- Run targeted tests with `cargo test --bin app-server db::trace::tests -- --nocapture`.

## Analytics / PostHog

- Client-side analytics is centralized in `frontend/lib/posthog/`. Feature code should import `track` from `@/lib/posthog` — never import `posthog-js` directly.
- Server-side PostHog client lives at `@/lib/posthog/server` (separate import path to avoid bundling `posthog-node` into client bundles).
- The `AnalyticsProvider` (in `lib/posthog/provider.tsx`) handles both PostHog init and user identification. It wraps `PostHogProvider` from `posthog-js/react` so `usePostHog()` still works as an escape hatch.
- Custom events use `track(feature, action, properties?)` which emits `${feature}:${action}`. The `Feature` type is defined in `lib/posthog/client.ts` — add new categories there before using them. Use `'sessions'` for trace sessions and `'debugger_sessions'` for CLI debugger sessions — these are distinct features.
- All tracking is no-op when PostHog is disabled (`POSTHOG_TELEMETRY !== "true"`). No conditional checks needed in feature code.
- For page-view tracking on server-component pages, use the `PageViewTracker` client component at `components/common/page-view-tracker.tsx` — server components cannot call `track` directly (no hooks). For server-action buttons that need tracking, wrap them in a dedicated `"use client"` component that calls `track` before invoking the server action (see `components/invitations/invitation-actions.tsx`).
- `PageViewTracker` deliberately uses an empty `useEffect` dependency array so it fires exactly once on mount. Callers pass inline `properties` object literals (`{ slug }`, `{ traceId }`), which would otherwise create a new reference on every render and re-fire the event.
- Auth flows (sign-in/sign-up) track `*_attempted` before the provider redirect, not on success — the OAuth/email flows navigate away before any success callback runs, so the attempt is the last reliable hook. `EmailSignInButton` takes an `action` prop (`sign_in_attempted` | `sign_up_attempted`) because the same component is rendered on both `/sign-in` and `/sign-up`.
- Tracking calls must be guarded by success (`res.ok`). Firing `track(...)` after an unchecked `await res.text()` records events for failed requests and corrupts metrics.
- `AdvancedSearch` submit tracking lives inside the store (`components/common/advanced-search/store/index.tsx`) — instrument `submit` / `addCompleteTag` there rather than in every call site, because URL-mode consumers pass no `onSubmit` (they rely on the store pushing to the router). The `resource` prop is threaded into the store so the event can label its origin (`traces` / `spans` / `unknown`).

## Key Technical Details

- **Rust edition**: 2024 (requires Rust 1.90+)
- **Node version**: 24+ (see Docker files)
- **Python version**: 3.13+
- **Package managers**: Cargo (Rust), pnpm (frontend), uv (Python)
- **Git workflow**: Submit PRs to `dev` branch, which merges to `main` periodically

## Pre-commit Hooks

The frontend uses Husky with lint-staged. Before commits:
- Prettier formats staged files
- ESLint fixes issues
- TypeScript type-check runs

**Known issue**: `tsc --noEmit` may fail with pre-existing errors for SVG/PNG asset imports (missing module declarations in `assets/`). These are unrelated to your changes — verify your file has no errors with `npx tsc --noEmit 2>&1 | grep "your-file"` before using `--no-verify`.

## Dashboard Time Grouping

- Time-range-to-grouping logic is duplicated in three places that must stay in sync: `getGroupByInterval` (`frontend/lib/utils.ts`), `inferGroupByInterval` (`frontend/lib/time.ts`), and `getOptimalDateFormat` (`frontend/components/chart-builder/charts/utils.ts`). When changing grouping thresholds, update all three.

## Trace-view Span Attributes

- The trace-view (transcript/tree) and shared-trace endpoints do NOT fetch the full `attributes` JSON blob from ClickHouse. LLM spans' `attributes` can be tens of kB each, so we extract only the keys listed in `TRACE_VIEW_ATTRIBUTE_KEYS` via `buildTraceViewAttributesExpression()` in `frontend/lib/actions/spans/utils.ts`. Downstream `tryParseJson` + key access keeps working unchanged because missing keys are omitted from the synthesized JSON.
- The single-span endpoint (`getSpan` in `frontend/lib/actions/span/index.ts`) still selects the full `attributes` — span-view renders the complete attribute table. Do not trim it there.
- When adding a new consumer of `attributes` inside trace-view components (transcript/tree/store/search/lang-graph), add the key to `TRACE_VIEW_ATTRIBUTE_KEYS` or the access will silently return undefined.
- Use full `JSONHas` + `JSONExtractRaw` (not `simpleJSON*` variants) in the expression — array/nested values like `lmnr.span.ids_path` contain embedded commas that the simple variants mishandle.

## Dashboard Charts API

- `app/api/projects/[projectId]/dashboard-charts/route.ts` exposes `GET` (list), `POST` (create), and `PATCH` (bulk layout update). There is NO `PUT`. Creating a chart from the chart-builder/sql-editor must use `POST`, not `PUT` (which would silently 405 and never reach `createChart`).

## Trace View Store

- `spanPanelOpen` in `trace-view/store/base.ts` must default to `false` and must NOT be persisted by `partialize`/`merge` in `store/index.tsx`. The dynamic (drawer) layout reads `showSpan = spanPanelOpen || (isAlwaysSelectSpan && !isLoading && spans.length > 0)`. If `spanPanelOpen` persists as `true`, the panel flashes open on mount and then snaps shut when `fetchSpans` calls `setSelectedSpan(undefined)` (which sets `spanPanelOpen: !!span`). The full-width trace page relies on `isAlwaysSelectSpan` to keep the panel pinned open.
- `showChatInitial` (derived from `chat=true` in the URL) must be passed through to `TraceViewContent` AND synced to `tracesAgentOpen` via `useEffect`. The store's `initialChatOpen` option is only read once at store creation via `useState`, but row click handlers set `traceId` synchronously while `router.push` defers the URL param update — so the store is often created with the stale (pre-push) URL. The effect in `TraceViewContent` compensates by opening the chat panel once `showChatInitial` flips to `true`.

## Signal Event Payloads

- Signal event payloads generated by `app-server/src/signals/utils.rs` embed markdown-formatted trace links (`[Label](https://lmnr.ai/project/<pid>/traces/<tid>?spanId=<sid>&chat=true)` or `laminar.sh` equivalent). Parse them with `parseSpanLinks` from `@/lib/traces/span-link-parsing` — the same parser is used by the trace-view's `renderSpanReferences` (for in-trace badges) and by the signals events table's `renderPayloadText` (for opening the trace drawer). When rendering in the signals events table (`frontend/components/signal/events-table/columns.tsx`), open the trace via the signal store (`setTraceId`/`setSpanId`) + `router.replace(...)` instead of full navigation, so the trace drawer slides in over the events table. Stop propagation on the anchor click so the table row click doesn't also fire.

## Span-view Message Parsing

- Span input/output JSON is normalized into one of several provider shapes by `processMessages` in `frontend/components/traces/span-view/messages.tsx`. Detection order matters: signals-gated Anthropic → OpenAI Chat Completions → OpenAI Responses → LangChain → Anthropic fallback → Gemini → generic. Each provider has a schema + parser file under `frontend/lib/spans/types/` and a renderer under `frontend/components/traces/span-view/<provider>-parts.tsx`.
- OpenAI Responses API format is flat: items array where each item has a `type` discriminator (`message`, `reasoning`, `function_call`, `function_call_output`, `web_search_call`, `computer_call`, `mcp_call`, etc.). Only message items carry a `role`. For role-colored headers in the Messages virtualizer, `responsesItemRole` in `messages.tsx` synthesizes a role: tool-call items → `assistant`, tool-output items → `tool`, `reasoning` → `assistant`.
- Responses schemas in `lib/spans/types/openai-responses.ts` deliberately do NOT use `.loose()` — every known field must be listed explicitly. Strict schemas are the detection mechanism: a Chat Completions or LangChain payload must fail to parse here so it can fall through to the right parser. When OpenAI adds a new field, add it to the schema rather than reintroducing `.loose()`.
- When adding a new provider format, update `ProcessedMessages`, `processMessages`, `buildToolNameMap`, and `renderMessageContent` in `messages.tsx`, and add a renderer component. Tool-call IDs are mapped to tool names via `buildToolNameMap` so tool-result items can show their originating tool name even when the output item only carries `call_id`. Note: `local_shell_call_output` has no `call_id` in the API — key it by `id`.

## Frontend Best Practices

### One component per file

Related components should be in a folder named by the parent component (`my-list/`) and the parent component should follow the index.tsx pattern (`my-list/index.tsx`) and all related components should be in the folder (`my-list/my-list-item.tsx`).

Please do your best to keep components <150 lines.

### Bias towards complex logic and state in the Zustand store

When you anticipate lots of complex state management with useState and useEffects, this would be a good time to rethink or refactor and move state into a shared store and expose derived state via selectors.

### Avoid syncing URL params with Zustand store antipattern

Use the nuqs library to handle url param state when possible. Avoid using a useEffect to sync URL param state with the Zustand store. Prefer keeping source of truth as the useQueryState and passing in necessary state as function params to the store when needed.

### Use Zustand shallow to avoid unnecessary rerenders

Pass shallow as the equality function to useStore when applicable. That way even with a new selector reference each render, Zustand compares the result shallowly and won't re-render if the contents are the same.

### AbortController

Use an `AbortController` to cancel in-flight `fetch` requests when a newer request supersedes them or the component/store state they'll update has moved on. Pass the controller's `signal` to `fetch`; the browser rejects the promise with an `AbortError` when aborted, so bail without touching state in the catch.

**Example — per-store cancellation of pagination when the underlying query changes** (`dashboard-editor-store.tsx`):

```typescript
const createStore = (props) => {
  // Closure-scoped per store instance — no cross-instance leak.
  let paginationAbortController: AbortController | null = null;

  return createStore((set, get) => ({
    executeQuery: async (projectId) => {
      // A fresh execute is about to replace page-0 data; any in-flight
      // pagination would splice stale rows onto it.
      if (paginationAbortController) {
        paginationAbortController.abort();
        paginationAbortController = null;
        set({ tableIsFetching: false });
      }
      // ...
    },

    fetchNextTablePage: async (projectId) => {
      // Abort any prior pagination (rapid scroll fires multiple times).
      paginationAbortController?.abort();
      const controller = new AbortController();
      paginationAbortController = controller;

      try {
        const response = await fetch(url, { signal: controller.signal, ... });
        // ... process result, functional set ...
      } catch {
        // Aborted — whoever replaced us owns state. Don't reset flags here.
        if (controller.signal.aborted) return;
        set({ tableIsFetching: false });
      } finally {
        if (paginationAbortController === controller) {
          paginationAbortController = null;
        }
      }
    },
  }));
};
```

**Problems this solves / when to use:**

- **Race conditions where an older request overwrites newer state.** Classic example: user paginates (page 1 in-flight), then changes the filter (triggers a new page-0 fetch). Without aborting, page 1 resolves after page 0 and splices stale rows onto fresh data.
- **Wasted network + server work** when the result is no longer needed. Aborting tells the browser to drop the request, which can also cancel the server-side query if the backend respects it.
- **Rapid user actions** like repeated scrolls, debounce-escaped clicks, or typing into a search field — only the latest request's result should land.

Prefer `AbortController` over hand-rolled "snapshot state at start, compare at resolve, discard if drifted" patterns — it's the standard browser primitive and cancels the actual network request, not just its effect on state.

**Gotchas:**

- Don't reset loading flags (`isFetching`, `isLoading`, etc.) in the abort branch of the catch. The operation that aborted you is responsible for the next state — resetting here would race with it.
- When aborting from a different action, the aborting action must handle any loading flag the aborted action left behind (see `executeQuery` above clearing `tableIsFetching`).
- In the `finally`, only null out the shared controller ref if it still points at the current controller — otherwise a newer operation already replaced it and you'd be clobbering its handle.
- In the success path, use functional `set((state) => ...)` rather than a closure over `state.data` so you merge with the latest value.

### Error handling

**Client-side fetch calls** (in `"use client"` components): Always wrap `fetch` calls in `try/catch`. Check `res.ok` before using the response. On error, show a toast notification to the user via `useToast()`. Extract the error message from the response JSON when available, falling back to a generic message.

```typescript
try {
  const res = await fetch(`/api/projects/${projectId}/resource`, { method: "POST", body: JSON.stringify(data) });
  if (!res.ok) {
    const errMessage = await res.json().then((d) => d?.error).catch(() => null);
    toast({ variant: "destructive", title: errMessage ?? "Something went wrong" });
    return;
  }
  // handle success
} catch {
  toast({ variant: "destructive", title: "Something went wrong" });
}
```

**API route handlers** (`app/api/**/route.ts`): Wrap the handler body in `try/catch`. Distinguish `ZodError` (return 400 with `prettifyError()`) from other errors (return 500). Always return a JSON response with an `error` field.

```typescript
try {
  const result = await someAction(input);
  return Response.json(result);
} catch (error) {
  if (error instanceof ZodError) {
    return Response.json({ error: prettifyError(error) }, { status: 400 });
  }
  return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
}
```

**Server components** (`page.tsx`): Let database/fetch errors propagate to the nearest `error.tsx` error boundary — do **not** catch them and convert to `notFound()`. Only use `try/catch` or `.catch()` when you need a specific fallback value for optional data. Use `notFound()` only for genuinely missing resources (i.e. when a query returns `null`/`undefined`).
