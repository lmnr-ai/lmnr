# Workspace audit log

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

Records who changed what in a workspace and who read trace data, shown to owners and admins under Settings → Audit log (LAM-2460).

## Write path

- app-server is the only writer. Rust code calls `audit::emit` (awaited, for writes) or `audit::emit_detached` (reads). Next.js posts to the internal `POST /api/v1/audit` route (`audit/routes.rs`), which calls `emit`. Never insert into `audit_events` from Next.js.
- `emit` resolves the workspace (from `workspace_id`, else the project), project name and actor emails at write time, so rows keep their labels after renames and deletions. It publishes to `audit_events_queue`; `audit::consumer::AuditEventHandler` batches inserts into ClickHouse. It is a no-op when `Feature::AuditLog` (`AUDIT_LOG_ENABLED`, default on) is off.
- `audit_events` (CH migration 82) is a `ReplacingMergeTree` keyed by `event_id`, so a redelivered batch dedupes. Read it with `FINAL`. `AuditEventCHRow` is positional: keep its field order equal to the migration's column order.
- Event names are a stable vocabulary: `AuditResource` / `AuditAction` / `AuditSource` / `AuditOutcome` in `audit/mod.rs`, mirrored in `frontend/lib/audit/events.ts` and checked by `tests/audit-events.test.ts`. Never rename a variant (rows are immutable); add one, and add it on both sides.
- `actor_role` is the user's `members_of_workspaces.member_role` read at write time, so it is the role held when acting; empty for API keys, and for events written after the actor left the workspace (e.g. `workspace.delete`).
- The internal route accepts only `{ type: "user", userId }` actors. `AuditActor::ApiKey` is `skip_deserializing` so a caller can't claim to be a key; key actors are built from the auth extractor (`AuditActor::api_key`).
- Events are written for every workspace. Only the page, `GET /api/workspaces/[id]/audit-events` and its `/export` (CSV, up to 100k rows, every export logged as `audit_log.export`) are gated (`lib/actions/audit-log/access.ts`): owner/admin (`permissionsForRole(...).viewAuditLog`) and, on Cloud (`Feature.SUBSCRIPTION`), Pro or higher (`workspaceHasAuditLog`). A plan-gated request is not logged; a role-denied one is logged as `denied`.

## Next.js routes

- Every mutating export (`POST`/`PUT`/`PATCH`/`DELETE`) in `app/api/**/route.ts` must be `= withAudit({ resource, action }, handler)` or `= noAudit("reason", handler)`; `tests/audit-coverage.test.ts` fails otherwise. Write the reason for `noAudit` so a reviewer can check it (e.g. "audited by app-server as sql.query"). `withAudit<Params>(meta, handler)` already includes `apiHandler` (the handler may throw `ApiError`s; the event records the mapped status), so never nest the two; `noAudit` wraps `apiHandler`/`internalApiHandler` explicitly.
- `withAudit` derives the outcome from the response status, the scope from `params.workspaceId`/`projectId`, and `resourceId` from the innermost `*Id`/`*Key` path param. For deletes without one it records the `id`/`*Ids` keys of the query string or JSON body in `metadata.ids`. Handlers add a label, metadata or a different scope with `audit.set(...)`, or call `audit.skip()` for a no-op.
- The path id is a parent, recorded in `metadata` under its param name and never as `resourceId`, when the request names its own targets: a `create` (`/dashboards/[dashboardId]/charts`), ids in the query/body (`/datasets/[datasetId]/datapoints`), or a handler that calls `audit.set({ resourceId })`. Setting `resourceId: undefined` (several targets) also opts out of the fallback.
- When the handler and path name no resource, a successful write takes `id` and `name` (or `title`) from its JSON response, so creates name what they created. Routes whose response isn't the created object must `audit.set` it (datapoint creates set the id when there is one, plus `count`).
- Deletes keep the deleted names: before the handler runs, `withAudit` reads them by id (query/body ids, else the path id) from `NAME_SOURCES` in `lib/audit/labels.ts`, scoped to the request's project or workspace. One id → `resourceLabel`; several → `metadata.names`. Add a resource there when it gains a delete route and a name column. `/v1` deletes do the same in `audit::middleware::deleted_name`; auth runs inside the handler, so the row's owner is read too and the name kept only if it matches the caller.
- Reads pass `read: true` and are sent with `after()`, so they never delay the response. List reads (`trace.list`) are logged for the first page only.
- Code outside route handlers (server components, auth hooks) uses `recordAuditEvent`. `lib/auth.ts` must use `postAuditEvent` from `lib/audit/post.ts`: `lib/audit/index.ts` imports `auth-session`, which imports `lib/auth`.

## `/v1` API and CLI

- `audit::middleware::audit_v1` wraps the whole `App`. After the response, it classifies `req.match_pattern()` (with the `/v1` or `/v1/cli` prefix removed) in `classify`. Add every new `/v1` route there: an unknown pattern logs a warning and records nothing.
- Ingestion (`/traces`, `/spans`, `/logs`, `/metrics`, browser events, `/tag`, labeling-queue items) and per-item calls are `Skip`. A run is logged once, at its start: `init_eval`, not trials; `register_session`, not blocks; hosted-eval `start_run`, not uploads or sandbox commands.
- The actor comes from request extensions: `ProjectApiKey` (inserted by `project_auth`) or `CliProjectAuth`, which the extractor inserts on success. CLI routes without a project (`/projects`, `/project`) carry no `CliProjectAuth` and are skipped.

## Audit log page

- The table has no saved views (they are project-scoped; the log is workspace-wide), so `useTableView().setFilters` is a no-op there. Filters live in the URL `filter` param (uncontrolled `DataTableFilter` + `useFilterUrlValue`), and the range in `pastHours`/`startDate`/`endDate` (default 1 week).
- The CSV export (`exportAuditEventsCsv`) reads 5k-row keyset pages on `(timestamp, event_id)`, fetched only as the client reads, and the route gzips it. Never fold it back into one `LIMIT 100000` query: ClickHouse sorts every selected row in memory, which passed 1 GB once rows carried 8–16 KB of SQL in `metadata` (staging, 2026-11). A typical 100k-row export is ~55 MB raw, ~7 MB gzipped.
- The list query aliases a formatted string as `timestamp`, which shadows the column in `WHERE`/`ORDER BY`; refer to the column as `audit_events.timestamp`.

## SQL

- `SqlQuerySource` (`sql/mod.rs`) is required on every SQL call, including the frontend `executeQuery`/`validateQuery` and the internal `/sql/query` and `/sql/validate` bodies. Platform-built SQL uses `internal` and is not audited. `editor` (anything sent through `/api/projects/[id]/sql`: the editor, dashboards, custom columns), `export`, `api`, `cli`, `mcp` and `agent` emit `sql.query` with `metadata.query` (16 KB cap), `metadata.tables` (from `validate_and_secure_query`) and `metadata.channel`. Rejected queries are logged as `denied`.
- SQL run through the internal `/sql/query` route is audited only for `Actor::User`. CLI chart writes test-run their queries there as `Actor::Cli` (no user), so `/v1/cli/dashboards/{id}/charts` emits their `sql.query` events itself (`audit_chart_queries`).
- Export jobs run the validated SQL in the external data exporter, so their event is emitted by `/sql/validate` with source `export`.
- The memory cap applies to `api`/`cli`/`mcp` only (`SqlQuerySource::is_memory_capped`).
- For HYBRID workspaces the stored query goes through `query_engine::validator::strip_literals` (string and number literals → `?`); if it doesn't parse, `metadata.query` is null. The `sql.query` OTel attribute is always literal-stripped.

## Not covered yet

- Slack actions, sign-ins, SCIM/Okta membership sync, retention and export.
- `sql.query` events carry no IP or user agent: they are emitted in app-server, which doesn't receive the browser's.
