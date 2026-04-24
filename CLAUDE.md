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

## Signals and Alerts

- Alerts reference signals via `alerts.source_id`. There is NO FK constraint from `source_id` to `signals.id` because `source_id` may reference other entity types in the future. When deleting signals, associated alerts must be deleted in application code within the same transaction (see `deleteSignal`/`deleteSignals` in `frontend/lib/actions/signals/index.ts`).
- The Signals sidebar item is behind a feature flag (`Feature.SIGNALS`) which requires `GOOGLE_GENERATIVE_AI_API_KEY` or AWS Bedrock credentials to be set.
- Alert metadata is stored as JSONB in `alerts.metadata`. For `SIGNAL_EVENT` alerts, it contains `{severity: 0|1|2}` (info/warning/critical). The Rust backend reads this in `postprocess.rs` to filter events by severity threshold, defaulting to CRITICAL (2) when metadata is absent (historical alerts default to the most restrictive level). The frontend edit form also defaults to CRITICAL for alerts without metadata.
- Creating a signal auto-creates a CRITICAL-severity alert and subscribes all workspace member emails as alert targets.
- The `NEW_CLUSTER` alert type and the `skipSimilar` metadata option depend on the clustering service. Gate both the auto-creation of `NEW_CLUSTER` alerts in `createSignal` and UI affordances in `manage-alert-sheet.tsx` behind `isFeatureEnabled(Feature.CLUSTERING)` / `useFeatureFlags()[Feature.CLUSTERING]`. When clustering is disabled, force `skipSimilar: false` on submit so the backend doesn't silently drop notifications.

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

## Dashboard Charts API

- `app/api/projects/[projectId]/dashboard-charts/route.ts` exposes `GET` (list), `POST` (create), and `PATCH` (bulk layout update). There is NO `PUT`. Creating a chart from the chart-builder/sql-editor must use `POST`, not `PUT` (which would silently 405 and never reach `createChart`).

## Trace View Store

- `spanPanelOpen` in `trace-view/store/base.ts` must default to `false` and must NOT be persisted by `partialize`/`merge` in `store/index.tsx`. The dynamic (drawer) layout reads `showSpan = spanPanelOpen || (isAlwaysSelectSpan && !isLoading && spans.length > 0)`. If `spanPanelOpen` persists as `true`, the panel flashes open on mount and then snaps shut when `fetchSpans` calls `setSelectedSpan(undefined)` (which sets `spanPanelOpen: !!span`). The full-width trace page relies on `isAlwaysSelectSpan` to keep the panel pinned open.
- `showChatInitial` (derived from `chat=true` in the URL) must be passed through to `TraceViewContent` AND synced to `tracesAgentOpen` via `useEffect`. The store's `initialChatOpen` option is only read once at store creation via `useState`, but row click handlers set `traceId` synchronously while `router.push` defers the URL param update — so the store is often created with the stale (pre-push) URL. The effect in `TraceViewContent` compensates by opening the chat panel once `showChatInitial` flips to `true`.

## Signal Event Payloads

- Signal event payloads generated by `app-server/src/signals/utils.rs` embed markdown-formatted trace links (`[Label](https://lmnr.ai/project/<pid>/traces/<tid>?spanId=<sid>&chat=true)` or `laminar.sh` equivalent). Parse them with `parseSpanLinks` from `@/lib/traces/span-link-parsing` — the same parser is used by the trace-view's `renderSpanReferences` (for in-trace badges) and by the signals events table's `renderPayloadText` (for opening the trace drawer). When rendering in the signals events table (`frontend/components/signal/events-table/columns.tsx`), open the trace via the signal store (`setTraceId`/`setSpanId`) + `router.replace(...)` instead of full navigation, so the trace drawer slides in over the events table. Stop propagation on the anchor click so the table row click doesn't also fire.

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
