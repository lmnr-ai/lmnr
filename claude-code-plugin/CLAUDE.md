# lmnr-claude-code-plugin

Laminar observability plugin for Claude Code. Stop/SessionEnd hooks parse the session transcript incrementally and export OTLP/HTTP/JSON spans to Laminar.

## Layout

- `.claude-plugin/plugin.json` — plugin manifest with `userConfig` (API key is `sensitive: true`).
- `.claude-plugin/marketplace.json` — marketplace manifest so `claude plugin marketplace add lmnr-ai/lmnr-claude-code-plugin` works.
- `hooks/hooks.json` — wires Stop + SessionEnd to `hooks/lmnr_hook.py` (`uv run --script` with `python3` fallback).
- `hooks/lmnr_hook.py` — single-file, pure-stdlib hook. Everything (transcript parsing, turn assembly, OTLP emission) lives here so `uv run --script` needs no dependencies.
- `tests/` — pytest suite; `conftest.py` importlib-loads the hook file as module `lmnr_hook`.

## Development

- Run tests: `uv run --group dev pytest` (or `python3 -m pytest` with pytest installed).
- Keep `hooks/lmnr_hook.py` dependency-free. The uv script header declares `dependencies = []`; adding a dep breaks the `python3` fallback path in hooks.json.

## OTLP / Laminar ingestion gotchas (verified against app-server)

- Wire format is OTLP/JSON, camelCase: `resourceSpans[].scopeSpans[].spans[]`. `traceId` = 32 hex chars, `spanId` = 16 hex chars, times as decimal-string nanoseconds, attribute values wrapped in `{"stringValue"|"intValue"(string)|"doubleValue"|"boolValue"|"arrayValue"}` envelopes. POST to `{base}/v1/traces` with `Authorization: Bearer <project api key>`.
- NEVER put per-span details in `lmnr.association.properties.metadata.*` — the app-server flattens those keys into TRACE-level metadata across ALL spans (last write wins). Use plain span attributes (e.g. `claude_code.tool.name`) for span-scoped data.
- `lmnr.association.properties.session_id` / `.user_id` / `.tags` go on the root span; tags must be an OTLP `arrayValue`.
- LLM spans: `lmnr.span.type=LLM`, `gen_ai.input.messages` / `gen_ai.output.messages` as JSON strings (preferred by app-server over legacy `gen_ai.prompt.N.*`), usage via `gen_ai.usage.{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}`.
- Spans are backdated to transcript timestamps. When verifying in ClickHouse, filter `start_time` by the session's era, not the export time; the `spans` table has no `created_at`. Trace rows live in `traces_replacing` (query with `FINAL`).

## Hook behavior invariants

- Fail-open: the hook must always exit 0; a Laminar outage must never block Claude Code.
- Per-session state (`~/.claude/state/lmnr_state.json`) stores the transcript byte offset; only advance it AFTER a successful export, so failed exports retry next Stop. A per-turn `emit_turn` exception is different: the turn is skipped (not counted in `turn_count`, no retry) because a malformed turn would fail identically on every retry and poison the session.
- Turns with async agent launches (`toolUseResult.status == "async_launched"`) are deferred until the task-notification row arrives, or flushed at SessionEnd.
