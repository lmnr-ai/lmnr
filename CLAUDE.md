# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Laminar is an open-source observability platform for AI agents. It provides OpenTelemetry-native tracing, evaluations, AI monitoring, and SQL access to all data.

## Repository Structure

This is a multi-service monorepo with three main components:

- **app-server/** - Rust backend (Actix-web HTTP, Tonic gRPC)
- **frontend/** - Next.js/TypeScript web UI
- **query-engine/** - Python gRPC service for SQL query processing
- **pii-redactor/** - optional Rust gRPC service that runs a HuggingFace token-classification PII model on CPU via ONNX Runtime. Standalone — not linked from app-server. Tested with the OpenAI privacy filter (BIOES) and Piiranha (BIO); accepts either scheme via `config.json` `id2label`. See `pii-redactor/README.md` for the gRPC contract, model layout (`model.onnx` + optional `model.onnx_data*` external-data shards + `tokenizer.json` + `config.json`), and the weight-baking Dockerfile.

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

## Labeling Queue Items (ClickHouse)

- Queue metadata (`labeling_queues`) still lives in Postgres. Per-item rows (`labeling_queue_items`) live in ClickHouse as a `ReplacingMergeTree(updated_at)` keyed `(project_id, queue_id, id)` — see `frontend/lib/clickhouse/migrations/42_labeling_queue_items.sql`. The migration also creates `labeling_queue_items_v0`, the SQL view that ad-hoc queries hit (registered in `query-engine/src/query_validator.py`).
- The low-level CH helpers (`insertQueueItems` / `getQueueItems` / `getQueueItemStates` / `updateQueueItem` / `deleteQueueItems` / `deleteQueueItemsByQueueIds` / `findQueueIdsByProgress` / `getQueueProgresses` / `copyQueueItemsToDataset`) live in `frontend/lib/actions/queue/items.ts` — co-located with the action functions in `index.ts` rather than under `lib/clickhouse/`. The `lib/clickhouse/` directory is for cross-feature primitives (the client, migrations) only.
- **Column model (mirror — `edit` is always the canonical current target):** `payload` is **immutable** after insert (the `{data, target, metadata}` JSON the queue was seeded with) — it's the original snapshot, never overwritten. The separate `edit String DEFAULT ''` column carries the **canonical current target as a JSON string**, seeded equal to `payload.target` on insert (Rust `create_labeling_queues_items`, TS `pushQueueItems`) and overwritten by every UI PATCH. `status UInt8 DEFAULT 0` replaces the old `is_labelled Bool` (0 = unlabeled, 1 = approved; `u8` so future states slot in without another rename). The v0 view re-exposes `edit` under the friendly name `target` (no `if(...)` coalesce — `edit` is always populated). Frontend mirrors of this rule: `getEffectiveTarget` (`frontend/components/queue/queue-store/index.tsx`) and the `effectiveTarget` helper in `frontend/lib/actions/queue/index.ts` both parse `edit` and only fall back to `payload.target` defensively for legacy rows.
- **Why mirror, not sentinel:** writing the seed everywhere means readers never branch on "is `edit` empty?" and `dirty` becomes a value compare instead of a write-detector. Reverting an edit to the original answer correctly drops the dirty flag — a sentinel (`edit !== ""`) can't, because the column would still be populated.
- **UI dirty derivation is structural:** `isDirty(item)` (in `queue-store/index.tsx`) deep-equals `JSON.parse(item.edit)` against `item.payload.target` via `lodash.isEqual`. Both sides are normalised to `null` before the compare — an API-ingested row with an omitted target stores `payload` without the key (parses back to `undefined`) but `edit` is seeded `"null"`, and `isEqual(null, undefined)` is false. `isApproved(item) = item.status === 1`. The lightweight index query never returns `payload`/`edit`, so dirty is computed only inside the windowed slice the user can actually see — no extra column / count needed server-side.
- **All reads must use `FINAL`** to collapse the most-recent version of each row. Writes append; there is no `UPDATE` — the read-modify-write helper `updateQueueItem` in `frontend/lib/actions/queue/items.ts` re-inserts with a fresh `updated_at`, preserves immutable fields (`payload`, `metadata`, `createdAt`, `idempotency_key`), and writes only the mutable columns (`edit`, `status`). The helper's narrow surface (`{ id, queueId, projectId, edit?, status? }`) deliberately omits `payload` — any caller that thinks it needs to write `payload` is bypassing the immutability invariant. The frontend never passes `edit: ""` either (the column stays populated for the lifetime of the row under the mirror model).
- Idempotency is enforced via **deterministic id derivation**, not a pre-flight existence check. When the caller supplies `idempotencyKey`, the Rust `create_labeling_queues_items` handler derives `id = Uuid::new_v5(&queue_id, idempotency_key.as_bytes())` inline. A retry with the same `(queue_id, idempotency_key)` lands on the same RMT sort-key tuple `(project_id, queue_id, id)` and collapses on merge / FINAL — last write wins by `updated_at`. Items without an idempotency key keep `Uuid::now_v7()`. The handler also dedupes same-key duplicates **within** one batch via a `seen_keys` HashSet (RMT would collapse them anyway, but skipping the duplicate write avoids a transiently doubled response list). There is no `existing_idempotency_keys` FINAL pre-check anymore — the previous "lookup-then-insert" approach left a race window where two concurrent inserts both passed the lookup and produced duplicate rows; the deterministic-id scheme closes that race entirely.
- **Trade-off the deterministic scheme accepts:** `payload` is no longer strictly immutable across retries. A same-key retry that arrives **after** the user has PATCH'd `edit` / approved (`status = 1`) will collapse to the new insert and silently revert both columns to the seed values (`edit = serde_json::to_string(&target)`, `status = 0`) because the new write has the larger `updated_at`. In practice retries fire seconds after the original ingest — long before a human labeler has touched the row — so the failure mode is rare, but callers should not rely on `payload` being frozen forever. Within-row updates from the frontend PATCH path (`updateQueueItem` in `frontend/lib/actions/queue/items.ts`) still preserve `payload` because that read-modify-write copies the existing payload into the new row; only public-API retries can rewrite it.
- `insertQueueItems` in `frontend/lib/actions/queue/items.ts` opts OUT of the client-level `async_insert: 1` by passing `async_insert: 0`. `updateQueueItem` does read-modify-write (FINAL SELECT → merge → INSERT). With async inserts, `wait_for_async_insert` only acks when the row enters the async buffer (flushed every ~200 ms by default), so a rapid follow-up RMW could FINAL-SELECT before flush, see nothing, and re-insert with default `createdAt` / empty `idempotency_key` / **empty `edit` (catastrophic under the mirror model — would silently revert the current target to "no current target")**. Synchronous inserts make the write immediately visible to the next SELECT. The table is low-volume (interactive labeling), so we lose no throughput.
- **Public ingest API does NOT accept `edit`.** The Rust `LabelingQueueItemRequest` only takes `{ data, target, metadata, idempotencyKey }`; the handler seeds `edit = serde_json::to_string(&target)` and `status = 0`. Subsequent overwrites flow exclusively through the frontend PATCH path (`/api/projects/<id>/queues/<id>/items/<id>`) → `updateQueueItemEdit` → `updateQueueItem({ edit?, status? })`. Public callers can never observe an empty `edit` for a row they created — the mirror is established at insert.
- Deletes use ClickHouse **lightweight DELETE** (`DELETE FROM ... WHERE ...`), which writes a tombstone that FINAL reads respect. `deleteQueueItems` / `deleteQueueItemsByQueueIds` wrap this. On queue deletion (`deleteQueues`), call `deleteQueueItemsByQueueIds` BEFORE the Postgres `DELETE` — FK cascades only cover Postgres.
- `pushItemsToDataset` defaults to pushing only rows where `status = 1` (the SQL `WHERE` inside `copyQueueItemsToDataset`). Pass `includeUnlabelled: true` to opt out of that filter and push every queue row regardless of approval (un-annotated rows land in the dataset with whatever effective target they carry — currently surfaced as the "All items in queue" radio in the push-to-dataset dialog at `frontend/components/queue/push-to-dataset-dialog.tsx`). Either way the function returns `{ pushed: <count> }` with a **200 status** even when nothing was pushed (e.g. caller passed an unlabelled `itemIds` without `includeUnlabelled`). Any UI that calls `/push-to-dataset` must gate local removal / success toasts on `result.pushed > 0` — `res.ok` alone is not sufficient.
- `pushItemsToDataset` (push branch) and `removeQueueItem` (DELETE-with-`datasetId` branch) both go through `copyQueueItemsToDataset` in `frontend/lib/actions/queue/items.ts`. It does the copy server-side via `INSERT INTO dataset_datapoints SELECT … FROM labeling_queue_items FINAL` so payload bytes never cross the wire — `edit` maps directly to `target` (mirror model), no client-side `effectiveTarget` resolution. Datapoint ids are minted in JS via `generateSequentialUuidsV7` and zipped onto source rows positionally with `row_number() OVER (ORDER BY id)` + `arrayElement(newIds, rn)` (the previous `indexOf`-zip silently collapsed to the zero UUID on UUID-string format drift). After the INSERT, a verify `SELECT count() WHERE id IN newIds` runs and the function throws if the count doesn't match — only on a verified insert do we issue `deleteQueueItems` to remove source rows. The DELETE route no longer accepts `data`/`target`/`metadata` in the request body; the server resolves everything itself. Datapoint ids are **non-deterministic** and `dataset_datapoints` is plain `MergeTree` (not RMT), so a retry after the verify-passed-but-delete-failed window WILL produce duplicate dataset rows; the UI gates the push button while in-flight so retries are explicit and the duplication is acceptable.
- The edit auto-save lives in a closure-scoped factory `createSaveOrchestrator` inside `frontend/components/queue/queue-store/index.tsx`. It tracks timers / abort controllers **per-item-id** in `Map<string, ...>`s. Do NOT collapse this back into a single `useDebounce(currentItem)`-style flow: a shared timer gets cleared when the user navigates within the 600 ms window, silently dropping A's edit if they tab to B. The orchestrator's surface is `schedule({ itemId, edit, doSave })` / `cancel(id)` / `cancelAll()` / `flushAllPending(getArgs)` / `hasPending(id)`. On `QueueDataLoader` unmount the provider calls `flushPendingSaves`, which routes through `orchestrator.flushAllPending` so all still-pending timers fire their PATCHes synchronously. Each debounced save sends `{ edit, status: 0 }` — editing always reverts approval, so the user re-approves once they're satisfied.
- Approve / unapprove / discard / push must call `orchestrator.cancel(currentItem.id)` before their PATCH/DELETE/POST. Without this, a delayed `status: 0` PATCH can arrive after approve's `status: 1` PATCH — RMT resolves by `updated_at`, so last-write-wins silently reverts the approval. Same reasoning applies to discard (a late re-insert with a fresh `updated_at` resurrects a row past its delete tombstone) and push-current. `pushAllToDataset` calls `orchestrator.cancelAll()` instead of looping ids — with windowing only a slice of items is loaded, so the client cannot enumerate the full set. Approve/unapprove PATCH bodies are `{ status: 1 }` / `{ status: 0 }` only — no target body, because the canonical value already lives in `edit` (which under the mirror model holds the current target whether or not the user has touched the form).
- The labeling queue UI uses **lazy windowed loading**, not all-at-once. State is split: `idsList: string[]` + `itemStates: Record<string, 'new' | 'modified' | 'approved'>` (cheap full ordering plus per-item lifecycle bucket, both hydrated once via `getQueueItemStates`) + `loadedItems: Record<string, LabelingQueueItem>` (sparse cache of full bodies for the current window only). `WINDOW_RADIUS = 2` so at most 5 full bodies are kept in memory. `setCurrentIndex` / `step` run `evictOutsideWindow` on every nav — but skip eviction for any id with a pending save (`orchestrator.hasPending(id)`) so the orchestrator's trailing PATCH can never fire against state we no longer hold.
- `getQueueItems` in `frontend/lib/actions/queue/items.ts` accepts an opt-in `ids?: string[]` filter for the windowed UI fetcher. Empty `ids: []` short-circuits to `[]` rather than emitting `IN ()` (ClickHouse syntax error → 500s the route). The same function still treats `limit`/`offset` as opt-in and emits no `LIMIT` clause when neither is set; callers without windowing get every row as before.
- The frontend `/api/projects/.../queues/.../items` route is **mode-multiplexed** by query string: `?ids=<csv>` returns `{ items }` for those ids only (window fetch); no `ids` returns `{ ids, progress }` (lightweight index + counts, no item bodies — and no `payload`/`edit` bytes). The first response is what `QueueDataLoader` SWR-caches; window fetches are issued via a manual `fetch` with an `AbortController` so a stale window response can't clobber a newer nav. Two response shapes from one URL is intentional — keeps SWR cache keys for the index trivially URL-keyed.
- The frontend `/api/projects/.../queues/.../items` route is **mode-multiplexed** by query string: `?ids=<csv>` returns `{ items }` for those ids only (window fetch); no `ids` returns `{ items: [{id, state}] }` — one tuple per queue row in `(created_at, id)` order. `state` is `'new' | 'modified' | 'approved'`, derived in SQL via `multiIf` on `(status, edit, JSONExtractRaw(payload, 'target'))`. The `new` vs `modified` split is a JSON-string compare on the raw `edit` column — susceptible to key-order drift if a future write path serialises target keys differently than insertion order (both Rust insert and TS PATCH preserve insertion order today, so it's stable for value-only edits). The same derivation lives in the frontend's `deriveItemState` so optimistic mutations (approve / edit / unapprove) can repaint the navigator bar without a round-trip.
- The navigator bar (`frontend/components/queue/navigator-bar.tsx`) renders one colored segment per item directly off `idsList` + `itemStates`: muted = new, amber = modified, green = approved. Counts in the legend (`new / modified / approved`) are derived from the same map by `computeProgress` — kept as a `progress` state field rather than a selector so the recount only runs on actual state changes (approve, edit, unapprove, discard, hydrate). The bar replaces the older percentage progress + filter chips combo entirely; there is no server-side `?statusFilter` parameter — the full ordering with state ships in one cheap query and the UI scrolls/clicks through it.
- `approveCurrent` / `unapproveCurrent` take no opts — both unconditionally write a single setState that flips `loadedItems[id].status`, sets `itemStates[id]`, and recomputes `progress`. `approveCurrent` then auto-steps to the next item (no filter to collapse the index, so the in-place repaint is always correct). The previous "step vs revalidate" branch existed only to handle the filter-collapses-the-index case; removing the filter removes the bug class.
- Queue hotkeys (`frontend/components/queue/hotkeys.tsx`) are scoped **per-shortcut**, not globally. `⌘⏎` (approve/unapprove) uses `{ enableOnFormTags: true, enableOnContentEditable: true }` so it fires inside CodeMirror editors and `<input>`s — it's the "submit + advance" key for the labelling loop and has no native binding to collide with. `⌘⌫` (discard), `⌘←` (prev), `⌘→` (next) use the **default scope** (no flags), so they do NOT fire when focus is in an input or a `contentEditable` host. The previous shared-options config let `⌘⌫` discard the whole queue item while the user was trying to delete a JSON line in the target editor, and `⌘←` / `⌘→` competed with cursor-to-line-start/end. Users can still keyboard-discard/navigate from inside the editor by pressing `Esc` first to blur. Do not "simplify" this back into a single shared options object.
- `created_at` / `updated_at` are `DateTime64(3, 'UTC')`. In Rust, model them as `u64` milliseconds since epoch (`Utc::now().timestamp_millis() as u64`); the JSON view from the TS client comes back as ISO strings formatted via `formatDateTime(..., '%Y-%m-%dT%H:%i:%S.%fZ')`.
- The queues list endpoint (`getQueues` in `frontend/lib/actions/queues/index.ts`) drops `annotationSchema` from the row payload and joins per-queue lifecycle counts via `getQueueProgresses` (in `frontend/lib/actions/queue/items.ts`) — one extra grouped CH query per page, scoped to the page's queue ids. The returned shape is `LabelingQueueWithProgress = LabelingQueue + { progress: QueueProgress }`. The queues table renders `progress` directly (total + new/modified/approved icons) instead of the old `count` column.
- **Progress filters** (`total` / `new` / `modified` / `approved` as numeric filters in the queues table) are evaluated cross-datastore. `getQueues` partitions the incoming `?filter=…` array via `isProgressFilter`: progress filters go to `findQueueIdsByProgress` (CH `GROUP BY queue_id … HAVING <expr>`) and the resulting id set is added to the Postgres query as `inArray(labelingQueues.id, …)`; non-progress filters (name/id) stay in the Postgres `WHERE`. The bucket SQL expressions in `PROGRESS_EXPR` mirror `getQueueItemStates` / frontend `deriveItemState` so HAVING totals never disagree with the navigator bar. **Limitation:** the GROUP BY only sees queues with ≥ 1 item, so `= 0` predicates do not match empty queues — `approved = 0` returns "queues that have items but zero approved", not "queues that have nothing approved including empty ones". The common filters (`approved > 0`, `new > 0`, `total > N`) work as expected; if zero-comparisons-including-empty become a real ask, branch on the operator and add an inverse `NOT IN` query rather than UNION-ing the empty set in.

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

## AI Features Model Setup

- All frontend AI features (chat-with-trace, SQL generation, span previews, session extraction regex, debugger-session naming) go through `getLanguageModel(tier)` in `frontend/lib/ai/model.ts`. Tiers are `small` / `medium` / `large` — never add new tier names without updating every call site.
- In OSS, these env vars are read by the frontend only (chat-with-trace / SQL-with-AI). Signals — which also reuses these vars — is not an OSS feature; it ships in `lmnr-private`. Don't document Signals as an OSS feature in the OSS README or docker-compose files.
- Provider selection: `LLM_PROVIDER` (=`openai` | `gemini` | `bedrock`) is the single switch. `openai` and `gemini` use `LLM_API_KEY` (+ optional `LLM_BASE_URL`; `openai` is OpenAI-compatible and works with LiteLLM proxy / OpenRouter / vLLM). `bedrock` uses AWS credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`) instead of `LLM_API_KEY`. `LLM_MODEL_SMALL` / `LLM_MODEL_MEDIUM` / `LLM_MODEL_LARGE` are optional overrides; each provider has hard-coded defaults in `DEFAULT_MODELS`. Mirror the app-server's provider matching in `app-server/src/features/mod.rs` / `llm/mod.rs` when extending.
- `Feature.SIGNALS` requires `SIGNALS_ENABLED=true` AND `isAiProviderConfigured()`. `Feature.BATCH_SIGNALS` is currently disabled via the feature flag (`return false`) until the batch path is re-enabled; when re-enabling, gate on `LLM_PROVIDER === "gemini"` since the backend batch API is Gemini-specific.

## Signals and Alerts

- Alerts reference signals via `alerts.source_id`. There is NO FK constraint from `source_id` to `signals.id` because `source_id` may reference other entity types in the future. When deleting signals, associated alerts must be deleted in application code within the same transaction (see `deleteSignal`/`deleteSignals` in `frontend/lib/actions/signals/index.ts`).
- The Signals sidebar item is behind a feature flag (`Feature.SIGNALS`) which requires `SIGNALS_ENABLED=true` AND a configured AI provider (`LLM_PROVIDER` set to `openai`/`gemini`/`bedrock` with matching credentials). See "AI Features Model Setup" above.
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
- Reconstruction uses the `llm_messages_dict` COMPLEX_KEY_CACHE dictionary defined in `frontend/lib/clickhouse/migrations/43_llm_messages.sql`. Earlier drafts used LEFT JOIN + `groupArray`, but CH cannot push the outer `trace_id` predicate through `GROUP BY`, so every single-trace view read aggregated all project messages. `dictGetOrDefault` keyed on `(project_id, trace_id, message_hash)` lets each span pay only for the hashes it actually references. Dictionary attributes cannot be `FixedString(N)` on CH 25.12 (fails `UNKNOWN_TYPE` at `CREATE DICTIONARY`) — `message_hash` is declared `String` in the dict and CH coerces the `FixedString(32)` hashes transparently at `dictGetOrDefault` call time. Dictionary refresh is configured via `LIFETIME(MIN 30 MAX 60)` so fresh inserts appear in lookups within ~1 minute.
- The `spans_v0` view exposes `multiIf(...) AS span_type` which collides with the underlying `spans.span_type UInt8` column under CH 25.x's analyzer. Migration 43 sidesteps the ambiguity without a column rename by adding a second column: `ALTER TABLE spans ADD COLUMN span_kind UInt8 DEFAULT span_type`. Existing rows auto-fill via the DEFAULT and new ingestion keeps writing `span_type` (see `CHSpan.span_type` in `app-server/src/ch/spans.rs`). The view reads `span_kind` in its `multiIf` and `WHERE` clauses; external consumers keep seeing the `span_type` string alias. Do NOT drop `span_type` from the raw table — ingestion depends on it, and `span_kind` is the DEFAULT-derived shadow column.
- Dedup affects `spans.size_bytes` and the workspace usage counter. `span.estimate_size_bytes()` intentionally does NOT count `input` — the post-dedup input-bytes loop in `process_span_messages` (`app-server/src/traces/processor.rs`) owns that charge for every span: dedup'd LLM spans pay `32 * num_hashes + span_content_bytes`; every other span (non-LLM, non-array input, or signal span that never reaches dedup) pays `estimate_json_size(span.input)`. `span_content_bytes` is the size of `llm_messages.content` rows this span caused to be newly inserted — messages already seen (Redis hit, or emitted earlier in the batch) contribute zero, so a shared message is billed once, to the first referrer, and subsequent referrers only pay the 32-byte hash. `build_dedup_batch` returns `span_content_bytes: Vec<usize>` aligned with `span_hashes` for this attribution. The loop runs before `CHSpan::from_db_span` (CH `size_bytes` column) AND before `update_workspace_bytes_ingested` (workspace limits / billed bytes), and covers all spans (not just `should_record_to_clickhouse`) so non-recorded spans still contribute input bytes to workspace usage.
- `estimate_size_bytes` filters `raw_attributes` via `should_keep_attribute` to match what ends up in `CHSpan.attributes` (which uses `to_value()` → same filter). Parsers like `parse_and_enrich_attributes` COPY input-bearing attributes (`lmnr.span.input`, `traceloop.entity.input`, `ai.prompt.messages`, GenAI `gen_ai.prompt.{i}.content`/`role`, etc.) into `span.input` without removing them from `raw_attributes`. Without the filter, those bytes would be counted once in `raw_attributes` and again via the post-dedup input-bytes loop — double-billing every OTel-flavoured LLM / tool span.
- The input-bytes loop MUST run AFTER `convert_span_to_provider_format` in `process_span_messages`. The LangChain provider conversion (`provider/langchain.rs`) replaces `span.input` with a fully rewritten `Value::Array` whose size differs from the original; running before conversion would charge for the raw attributes payload while dedup stores the converted array.
- ClickHouse 25.x views do NOT support correlated scalar subqueries (`SELECT (SELECT content FROM llm_messages WHERE message_hash = h) ...` and `WITH (SELECT ... WHERE trace_id = s.trace_id) AS ...` both fail `NOT_IMPLEMENTED: can't find correlated column` at execution time — the `CREATE VIEW` succeeds but every `SELECT` from the view blows up). Any reconstruction shape that references outer-scope columns inside a subquery's `WHERE` on this CH version is off the table; use the dictionary lookup instead.
- Redis key is `m:{project_id_simple}:{trace_id_simple}:{hex(hash)}` with TTL 1h — hot-path "seen recently" filter only. It MUST include `trace_id` because `llm_messages` is trace-scoped: a project-scoped key would suppress the insert of a message already seen in a different trace of the same project, leaving that trace's span with `input_message_hashes` pointing at rows that don't exist for its `trace_id`. Best-effort: on `cache.exists()` error we always insert and rely on ReplacingMergeTree to merge. `mark_seen` runs AFTER a successful `llm_messages` insert; on insert failure `unmark_seen` is called and the batch returns `HandlerError::transient` for retry. Never flip the order.
- Ingest order in `process_span_messages` is strict: build dedup batch → insert `llm_messages` → stamp Redis → insert `spans`. Within one flush, `build_dedup_batch` dedupes `(project_id, trace_id, hash)` triples via HashSet — the key MUST match `llm_messages` ORDER BY since a batch can mix projects.

## Quickwit indexing of LLM spans (LAM-1599)

- Quickwit only indexes the **new** subset of an LLM span's input — the messages this span was first to introduce in its trace. Older repeated history is searchable via the earlier span that introduced it. Implementation: `build_dedup_batch` in `app-server/src/traces/input_dedup.rs` returns `span_new_indices: Vec<Vec<u16>>` (0-based positions inside `span_hashes[i]`); `process_span_messages` projects those indices back onto `span.input` (`build_new_messages_subset`) and `QuickwitIndexedSpan::from_span` indexes the resulting array. Non-LLM spans / non-array input fall through to raw `span.input`.
- The same indices land in ClickHouse as `spans.input_new_message_indices Array(UInt16) CODEC(ZSTD(3))` (migration `44_spans_input_new_message_indices.sql`). `CHSpan` only populates them when `input_message_hashes` is non-empty; legacy rows have an empty array, which the search snippet query handles gracefully (empty `arrayMap` → empty input snippet, output / attributes still match).
- Search snippets read directly from the raw `spans` table (NOT `spans_v0`): for spans with `notEmpty(input_message_hashes)` the input snippet is built by `arrayMap(i -> dictGetOrDefault('llm_messages_dict', 'content', (project_id, trace_id, input_message_hashes[i + 1]), 'null'), input_new_message_indices)` joined with `,`; non-LLM spans (empty `input_message_hashes`) fall back to `extract(input, ...)` so their raw `spans.input` is still searchable. Output / attributes use `extract(...)` unconditionally. Single CH query, no parallel split. CH arrays are 1-indexed, hence `[i + 1]`. See `build_snippet_query` in `app-server/src/search/snippets.rs`.
- Cleaning runs at `from_span` build time, not in the consumer. `clean_for_indexing(s, strip_roles)` in `app-server/src/quickwit/preprocess.rs` chains `ANSI strip → strip_noise (base64 images, signature / thought_signature values) → optional strip_role_keys → clean_whitespace (collapse real + literal `\n\t\r`, drop other backslashes) → unicode whitespace classes → NFC`. LLM spans pass `strip_roles=true` for input/output; attributes always pass `false`. The chain only removes / collapses chars (never adds), so the snippet `extract()` regex with `[\s\S]{0,50}` context and `[^a-zA-Z0-9]+` token gaps still matches the reconstructed-and-cleaned text.
- Events keep their own `preprocess_text` path (`PreprocessForIndexing` impl on `QuickwitIndexedEvent`); spans' `PreprocessForIndexing` is a no-op because cleaning already happened upstream.

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

## RabbitMQ Connections

- `lapin::Connection` does NOT auto-reconnect — once the TCP socket drops it stays disconnected forever. Always wrap it in `ResilientConnection` (`app-server/src/mq/connection.rs`), which spawns a supervisor that listens on `Connection::events_listener()` for `Event::Error`, redials with uncapped exponential backoff, and atomically swaps the live connection in via `ArcSwap`. Callers read the current connection through `current()` on every operation — never cache an `Arc<Connection>` long-term, or you'll keep using a dead one after a swap.
- The channel pool (`RabbitChannelManager` in `app-server/src/mq/rabbit.rs`) calls `connection.current().create_channel()` per attempt. Channel-level failures (publish promise error, `channel.status().connected() == false`) MUST call `connection.notify_error()` — the events listener catches connection-level tear-downs but not every transient channel-level failure that should still trigger a redial.
- Liveness (`/health`) is process-only and always returns 200 (`app-server/src/routes/probes.rs`). Readiness (`/ready`) gates on `MessageQueue::is_healthy()` and returns 503 when the connection is mid-reconnect — so k8s steers traffic away during a blip but does NOT kill the pod. Do not re-couple `/health` to MQ state: a 3-replica cluster losing one node would otherwise crashloop the entire app-server fleet while ResilientConnection is doing its job.
- Quorum queues are already declared (`x-queue-type=quorum` in `main.rs`) so message data survives node loss; the resilience work is purely about client-side reconnect, not durability.

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
