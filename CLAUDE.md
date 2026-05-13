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

## Comment style

Keep comments short. Don't write multi-paragraph rationale blocks — a single terse line covering the WHY (non-obvious constraint, invariant, workaround) is enough. ClickHouse migration files especially should not carry prose explaining why a statement exists; the SQL is the source of truth. Prefer removing a comment over rewriting it once the identifier names make the intent obvious.

## OTel GenAI Semantic Convention Ingestion

- **Backend (app-server)** preserves the native OTel GenAI message shape end-to-end — `gen_ai.input.messages` / `gen_ai.output.messages` are deserialised from JSON string to `Value` but NOT reshaped into Laminar's `ChatMessage` struct. This keeps the original instrumentation payload lossless; the frontend owns rendering. Do NOT reintroduce a backend ChatMessage conversion here — this was explicitly reverted in favour of keeping the raw shape.
- `gen_ai.system_instructions` is prepended to the input messages as a synthetic `{role: "system", parts: [...]}` entry so the system prompt threads into the same message array. Bare-string arrays (`["Be helpful"]`) are preserved verbatim inside `parts` — the frontend parser handles both shapes. Helper: `prepend_system_instructions` in `spans.rs`.
- **Frontend parser** lives at `frontend/lib/spans/types/gen-ai.ts` (`parseGenAIMessages`). It runs in `processMessages` (`frontend/components/traces/span-view/messages.tsx`) AFTER the OpenAI/Anthropic/LangChain/Gemini detectors and decodes the GenAI parts (`text|thinking|tool_call|tool_call_response|uri|blob`) into `ModelMessage[]` for the existing generic renderer.
- Span-type inference from `gen_ai.operation.name`: `chat|text_completion|embeddings|generate_content` → LLM, `execute_tool` → Tool, `invoke_agent` → Default.
- **pydantic_ai tool-span quirk**: pydantic_ai emits `execute_tool <name>` spans WITHOUT `gen_ai.operation.name`; only `gen_ai.tool.call.arguments` / `gen_ai.tool.call.result` are set. `span_type()` has a fallback that classifies a span as Tool when either of those attributes is present. Do not remove this fallback when adding other GenAI emitters.
- The `gen_ai.tool.call.*` → `self.input`/`self.output` block in `parse_and_enrich_attributes` is gated on `self.span_type == SpanType::Tool` (not just the raw attribute keys) so it cannot clobber LLM-span input/output if a spec-violating emitter mixes LLM message attrs with tool-call attrs on the same span. The gate still works for pydantic_ai because `span_type()` already infers Tool from the `gen_ai.tool.call.*` fallback before this runs.

## Billing and Tier Allowances

- Tier included allowances are hardcoded in two places that MUST stay in sync: frontend `TIER_CONFIG` in `frontend/lib/actions/checkout/types.ts` (`includedBytes` / `includedSignalSteps`) and Rust `WorkspaceTierName` methods in `app-server/src/db/projects.rs` (`included_bytes()` / `included_signal_steps()`). The backend uses these to detect whether a triggered usage warning corresponds to the tier's free allowance vs. a user-configured custom threshold — this drives tier-specific copy in the usage-warning email ("you've exhausted your included Hobby allowance, from now on usage is billed pay-as-you-go").
- Stripe invoice line items expose their lookup key in two places: legacy `line.price.lookup_key` and the newer `line.pricing.price_details.price.lookup_key`. Email-subject/body rendering must check BOTH before falling back to `line.description` or a generic "Subscription charge" string, otherwise the subject line silently becomes `Laminar: Payment for  is received.` (trailing empty label).
## Workspace Usage Warnings vs Hard Limits

- Usage enforcement lives in two separate tables, both edited via Stripe webhook when a subscription is created or a tier is switched (`frontend/lib/actions/checkout/webhook.ts`):
  - `workspace_usage_warnings` — soft limits that fire a notification once per billing cycle. Checked in `check_soft_limits` in `app-server/src/utils/limits.rs`.
  - `workspace_usage_limits` — hard caps read by `get_project_and_workspace_billing_info` as `custom_bytes_limit` / `custom_signal_steps_limit` and enforced in `get_effective_*_limit` (app-server) and `checkSignalRunsLimit` (frontend).
- On tier transition into **Hobby**, we insert a soft warning row at the Hobby included allowance (5,000 signal steps) AND a hard-limit row for `signal_steps_processed` at `HOBBY_DEFAULT_HARD_LIMIT_SIGNAL_STEPS` (15,000). The hard cap is intentionally set to the same threshold as the overage email warning so ingestion is blocked at the same moment the user gets nudged. Pro and Free do NOT get a default hard limit.
- Hobby also gets two extra **overage warnings** above the included allowance (15,000 signal steps, 40 GiB bytes) so users accumulating a large overage bill are nudged before it grows further. These are Hobby-only rows; Pro does not get them. On transition OUT of Hobby they are cleared (matching exact value so user-adjusted thresholds are preserved) via `clearHobbyOverageWarnings`, which — like the hard-limit cleanup — runs on every transition including Hobby → Free.
- On tier transition OUT of Hobby, the default Hobby hard limit is deleted **only if it still equals a known Hobby default** — either the current `HOBBY_DEFAULT_HARD_LIMIT_SIGNAL_STEPS` (15,000) or the legacy `currentTierConfig.includedSignalSteps` (5,000, for workspaces whose row was written before the cap was raised). A user-set custom value is preserved across upgrades/downgrades. Same pattern is applied to warnings.
- The hard-limit cleanup runs on **every** recognized tier transition — including Hobby → Free on cancellation. Warnings, in contrast, are only written when the new tier is paid (Hobby/Pro) since Free has no warnings to carry. Leaving the Hobby limit in place during cancellation would silently re-apply the Hobby cap the next time the workspace upgrades to any paid tier.
- After inserting or deleting a `workspace_usage_limits` row, you MUST invalidate the per-project cache via `invalidateProjectCacheForWorkspace(workspaceId)` — the app-server caches `ProjectWithWorkspaceBillingInfo` keyed by project id and will otherwise keep enforcing stale limits until TTL.

## Signals and Alerts

- Alerts reference signals via `alerts.source_id`. There is NO FK constraint from `source_id` to `signals.id` because `source_id` may reference other entity types in the future. When deleting signals, associated alerts must be deleted in application code within the same transaction (see `deleteSignal`/`deleteSignals` in `frontend/lib/actions/signals/index.ts`).
- The Signals sidebar item is behind a feature flag (`Feature.SIGNALS`) which requires `SIGNALS_ENABLED=true` AND either `GOOGLE_GENERATIVE_AI_API_KEY` or AWS Bedrock credentials to be set.
- Alert metadata is stored as JSONB in `alerts.metadata`. For `SIGNAL_EVENT` alerts, it contains `{severity: 0|1|2}` (info/warning/critical). The Rust backend reads this in `postprocess.rs` to filter events by severity threshold, defaulting to CRITICAL (2) when metadata is absent (historical alerts default to the most restrictive level). The frontend edit form also defaults to CRITICAL for alerts without metadata.
- Creating a signal auto-creates a CRITICAL-severity alert and subscribes all workspace member emails as alert targets.
- The `NEW_CLUSTER` alert type and the `skipSimilar` metadata option depend on the clustering service. Gate both the auto-creation of `NEW_CLUSTER` alerts in `createSignal` and UI affordances in `manage-alert-sheet.tsx` behind `isFeatureEnabled(Feature.CLUSTERING)` / `useFeatureFlags()[Feature.CLUSTERING]`. When clustering is disabled, force `skipSimilar: false` on submit so the backend doesn't silently drop notifications.
- In `manage-alert-sheet.tsx`, the `severities` Controller uses `shouldUnregister`. When its render condition (`selectedSignal && alertType === SIGNAL_EVENT`) flips to false — e.g. after a successful save resets `selectedSignal` — react-hook-form removes the field from form state and `watch("severities")` returns `undefined`. Any `useMemo` that reads `watch`ed values must null-check them (don't call `.length`/`.map` directly) or it will throw synchronously and break the whole page into the error boundary.
- Alert Slack targets persist a channel `id` in `alertTargets.channelId` and the display name in `alertTargets.channelName`. Both columns are populated for every row written by the form, so `resetFormFromSignals` in `manage-alert-sheet.tsx` filters to rows where both are present and uses them directly — no name-as-id healing needed.
- `getSlackChannels` in `frontend/lib/actions/slack/index.ts` paginates through Slack `conversations.list` via `response_metadata.next_cursor` (limit=500/page) and returns `{ channels, rateLimited }`. On rate-limit (HTTP 429 OR a 200 OK with `{ok:false, error:"ratelimited"}`) it does NOT retry — it returns whatever was collected so far with `rateLimited: true`. The consumer (`manage-alert-sheet.tsx`) toasts when `rateLimited` is true so the user knows the list may be incomplete. We don't cache — each request fetches fresh so new/renamed channels appear immediately. The picker (`slack-channel-picker.tsx`) leverages cmdk's `Command` for filtering with a custom `filter` that scores against the channel name (passed via `keywords`); `value` holds the channel id so duplicate names aren't possible.
- The `types` query parameter on `conversations.list` must include both `public_channel,private_channel` — dropping `private_channel` silently breaks existing alert targets that point at private channels (they disappear from the picker and can't be re-selected).
- Slack section block `text` fields are hard-capped at 3000 chars — Slack rejects the whole `chat.postMessage` call if any block exceeds this. When building alert payloads in `app-server/src/notifications/slack.rs`, feed any user-sourced text (extracted event info, report summaries) through `truncate_to_slack_section_limit` rather than dropping overflowing entries. Count chars, not bytes, and slice on `chars()` to stay on char boundaries (multi-byte payloads will panic on byte-indexed slicing).

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
- `track(...)` accepts a 4th arg `{ sendInstantly: true }` that maps to posthog-js's `send_instantly` and bypasses the batching queue. Use it whenever the very next line can tear down the page before the batch flushes: OAuth/email `signIn()` redirects (`components/auth/*`), `router.refresh()` after a mutation (`switch-tier-dialog.tsx`), or any `window.location.assign/href` navigation. Batched events are lost because the request is aborted when the page unloads.
- Server-side captures from NextAuth callbacks (e.g. `auth:user_created` in `lib/auth.ts`) are fire-and-forget: `posthog-node`'s default 10s `flushInterval` schedules a background flush from the active `setTimeout` (which keeps the per-request `PostHog` instance alive until the flush fires), so the Next.js container delivers the event without an explicit `shutdown`/`flush`. Do NOT `await client.shutdown(...)` on the request path — it adds up to the shutdown timeout to the login response if PostHog ingest is degraded. Wrap the block in try/catch so analytics failures cannot break login.
- `auth:user_created` fires exactly once per brand-new account, in the `else` (no `existingUser`) branch of the `jwt` callback. The `signIn` callback sees `account` but the `jwt` callback only does if you destructure it explicitly (`jwt({ token, account, profile, trigger })`). Provider name comes from `account?.provider`; falls back to `"unknown"`.
- PostHog `distinctId` across the codebase is the user's **email**, not the DB user id. The single source of identification is the client-side `identify(email, { email })` call in `lib/posthog/provider.tsx` (mounted from the root `app/layout.tsx` so it runs on every authenticated page). Per PostHog's docs, server-side `posthog.identify(...)` only updates the person profile and CANNOT do the anonymous→identified linking the browser SDK does (the server has no anonymous session), so we deliberately don't call `identify` from `posthog-node` — it would just add redundant `$identify` events without contributing any new info. Any server-side `client.capture(...)` (e.g. from NextAuth callbacks) must still pass `distinctId: email` directly on each capture — passing the DB user id creates a separate PostHog person profile and detaches `$set_once` properties and funnel events from the real user.
- Workspace grouping uses the client-side `WorkspaceGroupTracker` (`components/common/workspace-group-tracker.tsx`), which calls `posthog.group("workspace", workspace.name, { name, id })` on mount. Per PostHog's web-SDK docs, `posthog.group(...)` does two things in one call: emits `$groupidentify` to register/update the group entity's properties AND associates every subsequent session event with `$groups: { workspace: <name> }`. We rely on this so client-side `track(...)` events are auto-tagged for workspace-level analytics — do not use server-side `posthog.groupIdentify(...)` instead, since that only updates the group entity and does NOT propagate group context to client events. The tracker is rendered in `app/workspace/[workspaceId]/page.tsx` (inside `WorkspaceMenuProvider`) and `app/project/[projectId]/layout.tsx` (inside `ProjectContextProvider`); render it in a component that already fetches the workspace so we don't add a duplicate query just to access `workspace.name`. Group key is `workspace.name` (readable in the PostHog UI) — do NOT key by id, PostHog group filters display the key directly. The tracker's `useEffect` is gated on `[workspaceName, workspaceId]` so it only re-fires on workspace switch, not every render.
- `lib/posthog/client.ts` is a thin wrapper around `posthog-js`: `init()` calls `posthog.init()` once and the other helpers (`identify`/`group`/`reset`/`track`) delegate directly. `posthog-js` handles its own pre-init buffering, so we don't maintain an internal queue or status flag — keep it simple.
- `AdvancedSearch` submit tracking lives in a single place: the store's `submit` function (`components/common/advanced-search/store/index.tsx`). `removeTag` and `applyRecentSearch` funnel through `submit`, so they are covered automatically; do not instrument them separately. `addCompleteTag` and `clearAll` do NOT funnel through `submit` — we intentionally accept under-counting there in exchange for one consistent metric definition (same `filterCount`/`hasSearch` logic everywhere). The `resource` prop is threaded into the store so the event can label its origin (`traces` / `spans` / `unknown`).
- `AdvancedSearch` autocomplete fetching is gated in `components/common/advanced-search/index.tsx`: SWR only hits `/api/projects/<id>/<resource>/autocomplete` when `resource === "traces" | "spans"` AND no `suggestions` map was passed. Omit the `resource` prop (or pass anything else) on pages that have no autocomplete endpoint (e.g. evaluations) to suppress the request. Tag-level suggestions in `components/common/advanced-search/components/tag.tsx` also silently degrade to `[]` when `AUTOCOMPLETE_FIELDS[resource]` is undefined, so no backend endpoint is required for non-traces/spans consumers.
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

## Next.js Catch-all Route Params

- In Next.js 16 App Router, **catch-all** (`[...slug]`) dynamic params are NOT auto-decoded — `await props.params` returns the raw URL-encoded segments. Single-segment dynamic params (`[slug]`) ARE auto-decoded. If a caller uses `encodeURIComponent` on an id containing URL-unsafe chars (e.g. Slack ids `slack:C0ATXMVNUH1:...`) and the target route is catch-all, the page must `decodeURIComponent` each segment or the encoded `%3A`s flow into downstream filters and the API double-encodes them (`%253A`) yielding zero results. See `app/project/[projectId]/sessions/[...sessionId]/page.tsx`.

## Dashboard Time Grouping

- Time-range-to-grouping logic is duplicated in three places that must stay in sync: `getGroupByInterval` (`frontend/lib/utils.ts`), `inferGroupByInterval` (`frontend/lib/time.ts`), and `getOptimalDateFormat` (`frontend/components/chart-builder/charts/utils.ts`). When changing grouping thresholds, update all three.

## LLM span input deduplication (`llm_messages` / `spans_v0`)

- LLM span `input` is stored structurally deduplicated: each message in the JSON array is BLAKE3-256 hashed (canonical JSON with sorted object keys so field-order-only differences collapse), emitted as a row in `llm_messages` (ReplacingMergeTree, `ORDER BY (project_id, trace_id, message_hash)`, trace-scoped — same content across two traces is two rows), and referenced from the span via `spans.input_message_hashes Array(FixedString(32))` while `spans.input` is stored empty. The `spans_v0` view reconstructs the original JSON array via `arrayMap(h -> dictGetOrDefault('llm_messages_dict', 'content', (project_id, trace_id, h), 'null'), input_message_hashes)`; when `input_message_hashes` is empty it falls through to `input`. The tool-span / non-LLM `input` is never touched. Content stored in `llm_messages` is the message's **original-order** `serde_json::to_string` output (not the canonical form) run through `sanitize_string`, so reads reconstruct byte-identical to what the non-dedup `CHSpan::from_db_span` path (`input.to_string()` → `sanitize_string`) would have written — `serde_json` is built with `preserve_order`, so field order reflects ingestion. The BLAKE3 hash is computed over the **sorted-key canonical JSON** so dedup identity is stable across field-order-only differences, even though the stored content preserves ingest order.
- Reconstruction uses the `llm_messages_dict` COMPLEX_KEY_CACHE dictionary defined in `frontend/lib/clickhouse/migrations/42_llm_messages.sql`. Earlier drafts used LEFT JOIN + `groupArray`, but CH cannot push the outer `trace_id` predicate through `GROUP BY`, so every single-trace view read aggregated all project messages. `dictGetOrDefault` keyed on `(project_id, trace_id, message_hash)` lets each span pay only for the hashes it actually references. Dictionary attributes cannot be `FixedString(N)` on CH 25.12 (fails `UNKNOWN_TYPE` at `CREATE DICTIONARY`) — `message_hash` is declared `String` in the dict and CH coerces the `FixedString(32)` hashes transparently at `dictGetOrDefault` call time. Dictionary refresh is configured via `LIFETIME(MIN 30 MAX 60)` so fresh inserts appear in lookups within ~1 minute.
- The `spans_v0` view exposes `multiIf(...) AS span_type` which collides with the underlying `spans.span_type UInt8` column under CH 25.x's analyzer. Migration 42 sidesteps the ambiguity without a column rename by adding a second column: `ALTER TABLE spans ADD COLUMN span_kind UInt8 DEFAULT span_type`. Existing rows auto-fill via the DEFAULT and new ingestion keeps writing `span_type` (see `CHSpan.span_type` in `app-server/src/ch/spans.rs`). The view reads `span_kind` in its `multiIf` and `WHERE` clauses; external consumers keep seeing the `span_type` string alias. Do NOT drop `span_type` from the raw table — ingestion depends on it, and `span_kind` is the DEFAULT-derived shadow column.
- Dedup affects `spans.size_bytes` and the workspace usage counter: `process_span_messages` in `app-server/src/traces/processor.rs` rewrites each dedup'd span's `size_bytes` after `build_dedup_batch` via `span.adjust_size_bytes(removed, added)` where `removed = estimate_json_size(span.input)` and `added = 32 * num_hashes + span_content_bytes`. `span_content_bytes` is the total size of `llm_messages.content` rows this span caused to be newly inserted — messages already seen (Redis hit, or emitted earlier in the batch) contribute zero, so a shared message is billed once, to the first referrer, and subsequent referrers only pay the 32-byte hash. `build_dedup_batch` returns `span_content_bytes: Vec<usize>` aligned with `span_hashes` for this attribution. The rewrite happens before `CHSpan::from_db_span` (CH `size_bytes` column) AND before `update_workspace_bytes_ingested` (workspace limits / billed bytes).
- `span.estimate_size_bytes()` MUST run AFTER `convert_span_to_provider_format` in `process_span_messages`. The LangChain provider conversion (`provider/langchain.rs`) replaces `span.input` with a fully rewritten `Value::Array` whose size differs from the original, and the dedup `size_bytes` rewrite subtracts `estimate_json_size(span.input)` on the current (post-conversion) input — so if estimate runs pre-conversion, the baseline and the subtracted-off portion don't match and workspace byte counters are off by the delta for every deduped LangChain LLM span.
- ClickHouse 25.x views do NOT support correlated scalar subqueries (`SELECT (SELECT content FROM llm_messages WHERE message_hash = h) ...` and `WITH (SELECT ... WHERE trace_id = s.trace_id) AS ...` both fail `NOT_IMPLEMENTED: can't find correlated column` at execution time — the `CREATE VIEW` succeeds but every `SELECT` from the view blows up). Any reconstruction shape that references outer-scope columns inside a subquery's `WHERE` on this CH version is off the table; use the dictionary lookup instead.
- Redis key is `m:{project_id_simple}:{trace_id_simple}:{hex(hash)}` with TTL 1h — hot-path "seen recently" filter only. It MUST include `trace_id` because `llm_messages` is trace-scoped: a project-scoped key would suppress the insert of a message already seen in a different trace of the same project, leaving that trace's span with `input_message_hashes` pointing at rows that don't exist for its `trace_id`. Best-effort: on `cache.exists()` error we always insert and rely on ReplacingMergeTree to merge. `mark_seen` runs AFTER a successful `llm_messages` insert; on insert failure `unmark_seen` is called and the batch returns `HandlerError::transient` for retry. Never flip the order.
- Ingest order in `process_span_messages` is strict: build dedup batch → insert `llm_messages` → stamp Redis → insert `spans`. Within one flush, `build_dedup_batch` dedupes `(project_id, trace_id, hash)` triples via HashSet — the key MUST match `llm_messages` ORDER BY since a batch can mix projects.

## Traces Table Filters and `traces_v0`

- The traces table queries the `traces_v0` ClickHouse view. Its schema evolves via migrations — migration 36 (`36_trace_tags.sql`) dropped the `trace_summaries` LEFT JOIN and removed `analysis_status`/`analysis`/`analysis_preview`/`summary` columns from the view. Older migration files (e.g. `6_trace-summary-views.sql`, `10_trace_browser_session.sql`) still reference those columns; they are historical and must not be edited — the view is superseded by the later migration.
- When removing a column from `traces_v0`, it must ALSO be removed from (1) `tracesColumnFilterConfig.processors` in `frontend/lib/actions/traces/utils.ts`, (2) the `filters` array in `frontend/components/traces/traces-table/columns.tsx`, and (3) the `TraceRow` type in `frontend/lib/traces/types.ts`. A stale filter processor is the mechanism by which selecting the filter in the UI injects SQL referencing a missing column and 500s the traces API route.

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

## Max-width centered content in scrollable panels

- When capping content width inside a panel that also owns the scrollbar (e.g. the session view list at `frontend/components/traces/session-view/session-panel/list.tsx`), apply `max-w-*` + `mx-auto` to the INNER virtualizer/content element — NOT to a wrapper around the scroll container. Wrapping the `overflow-y-auto` element makes the scrollbar render at the content edge instead of the panel edge, which looks wrong on wide viewports. Keep the scroll element full-width (`w-full`) and center a narrower inner `<div>` inside it.

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
