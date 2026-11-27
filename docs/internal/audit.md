# Workspace audit log

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

Records who changed what in a workspace and who read trace data, shown to owners and admins under Settings → Audit log (LAM-2460).

## Write path

- app-server is the only writer. Request paths call `audit::emit_detached` (fire-and-forget, reads and writes alike); only the internal route awaits `audit::emit`. Next.js posts to the internal `POST /api/v1/audit` route (`audit/routes.rs`), which calls `emit`. Never insert into `audit_events` from Next.js.
- `emit` resolves the workspace (from `workspace_id`, else the project), project name and actor emails at write time, so rows keep their labels after renames and deletions. It publishes to `audit_events_queue`; `audit::consumer::AuditEventHandler` batches inserts into ClickHouse. It is a no-op when `Feature::AuditLog` (`AUDIT_LOG_ENABLED`, default on) is off.
- `audit_events` (CH migration 82) is a `ReplacingMergeTree` keyed by `event_id`, so a redelivered batch dedupes. Read it with `FINAL`. `AuditEventCHRow` is positional: keep its field order equal to the migration's column order.
- Event names are a stable vocabulary: `AuditResource` / `AuditAction` / `AuditSource` / `AuditOutcome` in `audit/mod.rs`, mirrored in `frontend/lib/audit/events.ts` and checked by `tests/audit-events.test.ts`. Never rename a variant (rows are immutable); add one, and add it on both sides.
- `actor_role` is the user's `members_of_workspaces.member_role` read at write time, so it is the role held when acting; empty for API keys, and for events written after the actor left the workspace (e.g. `workspace.delete`).
- The internal route accepts only `{ type: "user", userId }` actors. `AuditActor::ApiKey` is `skip_deserializing` so a caller can't claim to be a key; key actors are built from the auth extractor (`AuditActor::api_key`).
- Events are written for every workspace. Only the page, `GET /api/workspaces/[id]/audit-events` and its `/export` (CSV, up to 100k rows, every export logged as `audit_log.export`) are gated (`lib/actions/audit-log/access.ts`): owner/admin (`permissionsForRole(...).viewAuditLog`) and, on Cloud (`Feature.SUBSCRIPTION`), Pro or higher (`workspaceHasAuditLog`). A plan-gated request is not logged; a role-denied one is logged as `denied`.

## Next.js routes

- Every mutating export (`POST`/`PUT`/`PATCH`/`DELETE`) in `app/api/**/route.ts` must be `= handlerWithAudit({ resource, action }, handler)` or `= handlerNoAudit("reason", handler)`; `tests/audit-coverage.test.ts` fails otherwise. Write the reason for `handlerNoAudit` so a reviewer can check it (e.g. "audited by app-server as sql.query"). `handlerWithAudit<Params>(meta, handler)` already includes `apiHandler` (the handler may throw `ApiError`s; the event records the mapped status), so never nest the two; `handlerNoAudit` wraps `apiHandler`/`internalApiHandler` explicitly.
- `handlerWithAudit` derives the outcome from the response status and the scope from `params.workspaceId`/`projectId` (or `audit.set({ workspaceId, projectId })`). It infers nothing about the resource: the handler names it with `audit.target(ids, { name?, parent? })`. `tests/audit-coverage.test.ts` requires every `handlerWithAudit` export to call `audit.target` or `audit.skip`, or set `noTarget: true` in its meta (workspace-level settings, subscriptions, deployments), and every delete to `await audit.target(...)`.
- **Auditing never changes the response.** The wrapper (`lib/audit/handler.ts`, deps injected by `index.ts` so `tests/audit-handler.test.ts` can drive it) records the event in `finally`, where a throw replaces the handler's response with a bare 500. So the recording step, `audit.target` (ids may come straight from a body: non-strings are dropped) and `recordAuditEvent` catch and log everything. Static routes get no `ctx.params` (#2677 was exactly that crash). Every event is sent after the response (`after()` in Next.js, `emit_detached` in Rust): an audit failure is only logged, so waiting on it bought nothing but latency. Events in flight when a pod shuts down can be lost; that is the accepted trade. Writes still read target names during the request, so a delete has them. Keep any new audit code inside those guards.
- `audit.target` reads display names from `NAME_SOURCES` in `lib/audit/labels.ts` (scoped to the request's project or workspace) when it is called, so a delete must await it before deleting; creates and updates call it after, with the returned row. Pass `name` when the handler already has it or the resource has no name column (members → email); `audit.target(null, { name })` labels an event with no id (an invited email). Add a resource to `NAME_SOURCES` when it gains a name column. For reads, `target` returns at once and the event waits for the lookup after the response.
- `targetFields` (`lib/audit/target.ts`, pure and unit-tested in `tests/audit-target.test.ts`): one target is `resourceId`/`resourceLabel`; several go to `metadata.ids`, `metadata.names` (when known) and `metadata.count`, capped at 100. Parents are only what the handler passes as `audit.target(ids, { parent: { dashboardId } })`, recorded in `metadata` under their keys; nothing is taken from the path, so a chart route names its dashboard and a datapoint route its dataset. `audit.set` takes metadata, a body-dependent `action` or a scope, never the resource.
- Reads pass `read: true` and are sent with `after()`, so they never delay the response. List reads (`trace.list`, `session.list`) are logged for the first page only. `session.view` is logged when a session is opened; the session view's live refetches and the session hover preview send `background=1` and are skipped.
- Code outside route handlers (server components, auth hooks) uses `recordAuditEvent`. `lib/auth.ts` must use `postAuditEvent` from `lib/audit/post.ts`: `lib/audit/index.ts` imports `auth-session`, which imports `lib/auth`.

## `/v1` API and CLI

- `audit::middleware::audit_v1` wraps the whole `App`. After the response, it classifies `req.match_pattern()` (with the `/v1` or `/v1/cli` prefix removed) in `classify`. Add every new `/v1` route there: an unknown pattern logs a warning and records nothing.
- `/v1` handlers name their resource the same way: `audit::target(&req, ids).await` reads names with the resource's static query in `audit::target::name_source` (the resource type comes from `classify`) and keeps a name only when the row belongs to the caller's project, or its workspace for LLM profiles; deletes call it before deleting. `target_named(&req, id, name)` skips the query, and `target_parent(&req, key, id)` records a parent (the dashboard of charts, the dataset of datapoints); as in Next.js, nothing is taken from the path. The targets travel in request extensions; `audit_v1` maps them like `targetFields` (100 cap, `count`, parents only from `target_parent`) and logs a warning for a successful create/update/delete that named none. Handlers that need it take `req: HttpRequest`; `lmnr-private` callers of the shared dataset, LLM-profile and hosted-eval handlers must pass it too.
- Ingestion (`/traces`, `/traces/metadata`, `/spans`, `/logs`, `/metrics`, browser events, `/tag`, labeling-queue items) and per-item calls are `Skip`. `/tag` also matches its CLI twin `/v1/cli/tag`, which stays unaudited like UI tagging (`handlerNoAudit`, "not security-relevant"). A run is logged once, at its start: `init_eval`, not trials; `register_session`, not blocks; hosted-eval `start_run`, not uploads or sandbox commands.
- The actor comes from request extensions: `ProjectApiKey` (inserted by `project_auth`) or `CliProjectAuth`, which the extractor inserts on success. CLI routes without a project (`/projects`, `/project`) carry no `CliProjectAuth` and are skipped.

## Audit log page

- The table has no saved views (they are project-scoped; the log is workspace-wide), so `useTableView().setFilters` is a no-op there. Filters live in the URL `filter` param (uncontrolled `DataTableFilter` + `useFilterUrlValue`), and the range in `pastHours`/`startDate`/`endDate` (default 1 week).
- The CSV export (`exportAuditEventsCsv`) reads 5k-row keyset pages on `(timestamp, event_id)`, fetched only as the client reads, and the route gzips it. Never fold it back into one `LIMIT 100000` query: ClickHouse sorts every selected row in memory, which passed 1 GB once rows carried 8–16 KB of SQL in `metadata` (staging, 2026-11). A typical 100k-row export is ~55 MB raw, ~7 MB gzipped.
- The list query aliases a formatted string as `timestamp`, which shadows the column in `WHERE`/`ORDER BY`; refer to the column as `audit_events.timestamp`.

## SQL

- `sql.query` is logged by the route that received the query, like any other event; `sql/mod.rs` knows nothing about auditing. `run_sql_query` returns the rows and the tables the validator saw (`execute_sql_query` drops the tables), and the route puts `metadata.query` and `metadata.tables` on its event:
  - `/api/projects/[id]/sql` (the editor, dashboards, custom columns): `handlerWithAudit`, with the tables from the internal `/sql/query` route's `x-laminar-sql-tables` header (`executeQueryWithTables`).
  - `/api/projects/[id]/sql/export-job`: `sql.export`, with the query and dataset. The exporter runs the validated SQL outside app-server, so this route is the last point that sees it.
  - `/v1/sql/query` and `/v1/cli/sql/query`: the `/v1` middleware; `handle_sql_query` adds the metadata with `audit::metadata`.
  - MCP `query_laminar_sql`: the tool handler, because the single `/mcp` route serves every tool.
- SQL the platform builds (tables, charts, datasets) goes through no audited route, so it isn't logged. CLI chart saves test-run their queries as `Actor::Cli`; the `chart.update` event covers them, since nothing is read back.
- The outcome comes from the status like every other event, so a query the validator rejects (400) is `error`.
- `audit::enrich` makes `metadata.query` storable for every `sql` event, whichever side sent it: truncated to 16 KB and, for HYBRID workspaces, passed through `query_engine::validator::strip_literals` (string and number literals → `?`; null if it doesn't parse). The `sql.query` OTel attribute is always literal-stripped.
- `SqlQuerySource` only decides the memory cap (`Public`: `/v1`, CLI, MCP).

## Not covered yet

- Slack actions, sign-ins, SCIM/Okta membership sync, retention and export.
