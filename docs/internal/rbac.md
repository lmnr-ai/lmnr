# RBAC v0: role-based PII masking

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

**Status: PR1 shipped behind `PII_DUAL_MODE_ENABLED` (default off).** PR1 covers the main pipeline — ClickHouse storage, ingestion, the access policy, and the spans/traces read path. The "Known gaps" section lists what a project in `dual` mode still leaks until the follow-ups land; that is why the flag stays off in production.

## Goal and scope

- v0 has exactly one permission, `view_pii`. The model, storage, and read path are built so further permissions (e.g. "see only traces with certain tags") and custom roles are data changes, not redesigns.
- Roles are workspace-level (`member | admin | owner`); the PII mode is project-level (`projects.settings.piiMode`). A user's effective policy combines both.
- Out of scope for v0: `attributes`, `events`, `metadata`, `user_id`/`session_id` (stay raw); scoped API keys; per-member permissions.

## Permission model

- Built-in defaults only, no `workspace_roles` table yet: `permissions_for_role` in `app-server/src/access_policy/mod.rs` gives owner/admin `{view_pii: true}` and member `{view_pii: false}`. Unknown role strings get member permissions (fail-closed).
- **Invariant: no data-read path branches on the role name.** Membership/management checks may keep using the enum; anything deciding *what data a user sees* reads `RolePermissions`. Custom roles later = a `workspace_roles(workspace_id, name, permissions jsonb)` table feeding the same struct.
- Only owner/admin may change `piiMode`. Enforced in `frontend/app/api/projects/[projectId]/settings/route.ts` (`PRIVILEGED_KEYS`) via the uncached `getWorkspaceRole`; the UI disables the control for members.

## Access policy

- `AccessPolicy { mask_pii }` (`access_policy/mod.rs`) is the only type that serializes to the JSON the views consume (`to_view_arg()` → `{"maskPii":true}`; `UNRESTRICTED` → `{}`). Absent keys mean "no restriction", so adding a field never invalidates callers passing `'{}'`.
- Derivation: `AccessPolicy::for_actor(actor, project_id, db, cache)`. `mask_pii = effective_pii_mode == Dual && !permissions.view_pii`. `Off`/`Redact` projects are unrestricted for everyone (there is nothing to mask). Inputs are cached — `project:{id}` (settings) and `member_role:{workspace_id}:{user_id}` (1h TTL, positive-only) — the policy itself is not, so a mode flip or role change needs no cross-user invalidation. The frontend removes the `member_role` key on role update, ownership transfer, and member removal (`lib/actions/workspace/index.ts`); the key format is duplicated in `lib/cache.ts` and `cache/keys.rs` and must stay in sync.
- **Actor contract.** The internal `/sql/query` and `/sql/validate` routes require an `actor`: `{"type":"user","userId":"…"}` or `{"type":"shared"}`. A missing actor is a 400; a derivation error masks (`routes/sql.rs::policy_for`). `shared` and non-members always mask in `dual`. The frontend resolves it in `lib/actions/sql/actor.ts` (explicit → session user → `SHARED_ACTOR`) and passes it as a separate `options.actor` argument — **never from a request body**; `app/api/projects/[projectId]/sql/route.ts` spreads the body into `executeQuery`, so an actor in the input schema would be user-controlled.
- Unrestricted callers, each marked with a comment: public API keys (`api/v1/sql.rs`, `api/v1/mcp.rs`, CLI), saved-query and dataset internals (`sql/queries.rs`, `datasets/service.rs`), and every backend pipeline (system-prompt versioning, debugger, private signals). They need raw data for correctness; API keys get the admin-equivalent policy until `project_api_keys.permissions` exists.

## Storage: sparse dual

- `piiMode: off | redact | dual` replaces the `removePii` boolean (Drizzle migration `0111_pii_mode.sql` rewrites the JSONB; both readers still translate a stray `removePii: true` to `redact`). Rust: `PiiMode` in `db/projects.rs`; an unknown string deserializes as `Redact` with a warning. `effective_pii_mode()` maps `Dual` → `Redact` while `Feature::PiiDualMode` is off, so a stale `dual` setting never stores raw text on a deployment that cannot mask it. The read policy uses the *configured* `pii_mode()` instead: rows written while the flag was on still hold raw text, so turning the flag off must keep masking them (redact-mode rows carry state 1/2 with empty copies and render their already-redacted text). The frontend rejects writing `dual` when its `Feature.PII_DUAL_MODE` is off; both read the same `PII_DUAL_MODE_ENABLED`.
- `redact` is the destructive path (redactor output replaces `input`/`output`, raw is never stored). `dual` keeps raw in `input`/`output` and writes `input_redacted`/`output_redacted` **only when the redactor output contains `[REDACTED_`** (`REDACTED_MARKER`); byte or `Value` equality is meaningless because the redactor re-serializes nested JSON.
- `pii_state UInt8` on `spans` and `deduped_content`: `0` unchecked (default; every pre-existing row, and every row written in `off`/`redact`), `1` clean, `2` redacted, `3` failed (RPC error, oversize, unparsable). One state covers both sides of a span: state `2` with an empty `*_redacted` on one side means that side was clean, so the view shows raw for it. `PiiState`/`SpanPii`/`PiiOutcome` live in `pii_redactor/mod.rs`; `redact_spans_in_place` is generic over `RedactTexts` so tests use a fake client.
- Dedup'd LLM messages (`deduped_content`) get the same treatment per message; the span's own `*_redacted` columns are cleared when message hashes are present, since the view resolves those through the dict. `deduped_content_dict` (recreated at frontend boot, `instrumentation.ts`) carries `content, content_redacted, pii_state`. Legacy `llm_messages_dict` content has no state and is unavailable under mask.
- **Dedup self-heal**: the `s:` storage-presence key is stamped only for rows that landed clean or redacted (`processor.rs`), so a `failed` `deduped_content` row is re-inserted by the next occurrence instead of needing a retry queue.
- Quickwit indexes the redactor output in both modes; in `dual`, a `failed` span contributes no `input`/`output` to its document (`PiiOutcome::is_indexable`). A raw index would be a yes/no oracle for members.
- Rejected alternative, for the record: raw + offset masks applied at read time. It lost on the redactor re-serializing nested stringified JSON (most tool-result masks become full copies) and on offsets being a permanent leak-on-drift invariant inside a security boundary.

## Read path

- ClickHouse parameterized views have no default arguments, so adding `policy` to `spans_v0`/`traces_v0` would break every bare caller. Migration `64_pii_dual_storage.sql` adds **`spans_v1(project_id, policy)`** and **`traces_v1(project_id, policy, min_start_time, max_start_time)`**; the `_v0` views are unchanged. `policy` is a JSON string; the views read `JSONExtractBool({policy:String}, 'maskPii')`, which ClickHouse constant-folds, so `'{}'` compiles to the v0 plan (verified with EXPLAIN: no `pii_state`/`*_redacted` reads).
- Masked shape for whole values: `multiIf(pii_state = 1, raw, pii_state = 2, if(empty(redacted), raw, redacted), '"[PII_MASKED_UNAVAILABLE]"')`. The sentinel is a JSON string literal so `input`/`output` stay parseable; `unchecked` and `failed` both render it — **fail-closed, including history ingested before a project flipped to `dual`**. Per dedup'd message the same choice runs inside the reconstruction lambda and yields JSON `null` when unavailable; `tool_definitions` (also a `deduped_content` row) resolves the same way and yields the sentinel. `traces_v1.agent_input` is masked entirely under `maskPii` (`traces_static` has no state yet).
- The query-engine `ViewRewriter` (`query_engine/validator.rs`) rewrites `spans`/`traces` to the `_v1` views and injects `policy = '<json>'` next to `project_id`; a user-supplied `policy` argument is rejected like `project_id`. Other tables (`evaluation_datapoints`, `signal_*`, `trace_outputs`, …) still target `_v0` without a policy (`takes_policy()`). `validate_and_secure_query(sql, project_id, policy)` is the entry; tests in `validator/tests.rs` assert every spans/traces reference receives the policy.
- Direct `_v1` callers outside the rewriter pass `policy='{}'`: `ch/spans.rs` (debugger page), `ch/system_prompt_versions.rs`, private `signals/private/spans.rs`.
- Adding a `spans` column now means updating **both** `spans_v0` and `spans_v1` (plus the allowlists listed in `clickhouse-traces.md`).

## Known gaps (why the flag is off)

Each of these lets a member of a `dual` project see raw text and is a follow-up PR:

- Realtime SSE (`realtime/`, `send_span_updates`) publishes the raw span once to every subscriber; needs dual publish with per-connection policy.
- `trace_outputs_v0` (agent output) and `signal_events_v0` take no policy; Signals stores its produced event raw (`handle_create_event`, private repo).
- Search snippets (`search/snippets.rs`) extract from the raw `spans` columns; under `maskPii` they must read `*_redacted`.
- `traces_static.input` (extracted task) has no redacted copy or state, hence the blanket mask on `agent_input`.
- The Laminar Agent (private repo) reads trace context and runs its `query_sql` tool unrestricted, and its replies are not masked per user.
- Backfill for `unchecked` history, per-role notification rendering, and a `pii_terms` search field for admin raw search.
