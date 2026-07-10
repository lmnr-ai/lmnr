# codex-plugin

Laminar observability hook for the OpenAI Codex CLI. Parses Codex rollout JSONL files and exports completed turns as OTLP traces to Laminar. Lives in the lmnr monorepo for now; planned to split into its own repo later.

## Layout

- `src/hook.ts` — entrypoint. Reads the hook payload (stdin for the >=0.144 hooks system, last argv arg for legacy `notify`), resolves the session id + rollout path, and runs the emit pipeline. Always exits 0.
- `src/config.ts` — env-var configuration (`LMNR_*` with `CODEX_LMNR_*` fallbacks), state-dir paths, limits.
- `src/rollout.ts` — rollout JSONL parsing: line typing, timestamp parsing, incremental byte-offset reads with partial-line buffering, injected-user-text filtering, truncation, rollout-path discovery by thread id.
- `src/turns.ts` — pure state machine grouping rollout rows into turns (user message → steps → task_complete/turn_aborted), usage-key normalization.
- `src/emit.ts` — turn → span-tree construction (root DEFAULT span + LLM spans per step + TOOL spans per call), Laminar association attributes, session-state orchestration under the state lock.
- `src/tracer.ts` — OTel BasicTracerProvider with a collecting processor, OTLP/HTTP JSON export with Bearer auth and a hard timeout.
- `src/state.ts` — per-session state (`offset`, `buffer`, `turnCount`, `pendingTurnRows`, `lastModel`, `meta`), atomic writes, proper-lockfile locking.
- `src/logger.ts` — file logger with 5 MB rotation.
- `src/types.ts`, `src/util.ts` — shared types and helpers.
- `tests/` — `node:test` suites run via tsx (`npm test`).
- `dist/hook.cjs` — committed esbuild bundle. This is the deployable artifact; rebuild (`npm run build`) and commit it with any `src/` change.

## Rollout format notes (verified against openai/codex rust-v0.144.0)

- Every line is `{"timestamp","type","payload"}`. Types: `session_meta`, `turn_context` (carries model), `response_item`, `event_msg`, `compacted`.
- `response_item` subtypes: `message`, `reasoning`, `function_call` (its `arguments` is a raw JSON **string** — double-parse), `function_call_output`, `local_shell_call`, `custom_tool_call`/`_output`, `web_search_call`.
- Turn boundaries come from `event_msg` payloads: `task_started`, `task_complete` (carries `last_agent_message`), `turn_aborted`.
- `token_count` events carry `info.last_token_usage`; `input_tokens` already INCLUDES cached tokens (OpenAI convention), so `llm.usage.total_tokens = input + output` — do not add `cache_read` again.
- Forked sessions copy history, so a rollout can contain multiple `session_meta` lines: **first one wins** (`captureSessionMeta`).
- User messages beginning with `<environment_context>` / `<user_instructions>` (any case) are Codex-injected, not real prompts — filtered out.

## Hook invocation modes

- **Hooks system (>= 0.144):** JSON on stdin with `session_id`, `transcript_path`, `hook_event_name`. Only `Stop`/`SubagentStop` events trigger emission.
- **Legacy `notify`:** JSON as the final argv argument, kebab-case keys (`thread-id`), no transcript path — the rollout is found by scanning `<CODEX_HOME>/sessions` (depth ≤ 3) for `rollout-*-<threadId>.jsonl`, newest mtime wins.

## Behavior invariants — do not break these

- **Fail-open:** the hook must never break Codex. `main()` always resolves to exit code 0; top-level catch also exits 0. Errors go to `lmnr_hook.log` only.
- **At-least-once export:** state (offset/turnCount) is persisted only AFTER a successful export. Duplicates on retry are acceptable; silent data loss is not.
- **Per-turn emit failures** (malformed rows) are logged and the turn is skipped — it would fail identically on retry, so it must not poison the offset.
- **Incomplete trailing turns** (no `task_complete` yet) are held via `pendingTurnRows` and replayed on the next invocation, unless `flushIncompleteTurns` is set.
- **Partial trailing lines:** the reader keeps an unterminated final line in `sessionState.buffer`, but `readNewJsonl` ALWAYS attempts to parse the buffered line on every read (a complete-but-unterminated row — often `task_complete` — is consumed; a genuinely partial line fails JSON.parse and stays buffered). This must be unconditional: the offset advances to EOF regardless, so once no more bytes are appended a gated flush would strand the row forever.
- **File shrink detection:** if the rollout is smaller than the stored offset, reset offset/buffer and re-read from zero.
- **State locking:** all read-modify-write of `lmnr_state.json` happens under proper-lockfile (`withStateLock`) — concurrent hook invocations are real (subagents).

## Laminar/OTLP ingestion gotchas

- `lmnr.association.properties.*` (session_id, user_id, tags, metadata.*) go on the ROOT span only — the app-server propagates them trace-wide. Per-tool metadata must NOT use that prefix (it would leak onto every span); use plain attrs like `codex.tool.name` instead.
- `lmnr.span.type` values: `DEFAULT`, `LLM`, `TOOL`. Inputs/outputs go in `lmnr.span.input` / `lmnr.span.output` as JSON strings.
- Spans are backdated to rollout timestamps via explicit `startTime`/`endTime`.
- Export is OTLP/HTTP **JSON** to `{base}/v1/traces` with `Authorization: Bearer <key>`, hard 5s timeout.

## Testing

- `npm test` (23 tests), `npm run typecheck`.
- `emitNewTurnsFromRollout` takes an injectable `exportFn` so tests exercise the full pipeline without a network; `CODEX_LMNR_STATE_DIR` redirects state for test/e2e isolation.
- For e2e against the local stack: craft a synthetic rollout under a fake `CODEX_HOME`, invoke `dist/hook.cjs` with a legacy-notify argv payload, then verify spans in ClickHouse (`spans`, and `traces_replacing` — ReplacingMergeTree, query with `FINAL`).
