# Laminar Codex Plugin

Observability hook for the [OpenAI Codex CLI](https://github.com/openai/codex) that sends every Codex turn to [Laminar](https://laminar.sh) as an OpenTelemetry trace.

Each completed turn becomes one trace:

- A root span named `Codex - Turn N (<session prefix>)` carrying the user prompt as input and the final assistant message as output.
- One `LLM` span per model step, with `gen_ai.input.messages` / `gen_ai.output.messages`, model name, and token usage (input / output / cached).
- One `TOOL` span per tool call (shell, MCP, web search, custom tools), parented to the root span, with arguments as input and the tool result as output.

Traces are tagged `codex` and carry the Codex thread id as the Laminar session id, so all turns of one Codex session group together.

## Installation

Requires Node.js 18+ and a Laminar project API key.

1. Build (or use the committed bundle at `dist/hook.cjs`):

   ```bash
   npm install
   npm run build
   ```

2. Register the hook in `~/.codex/config.toml`.

   **Codex >= 0.144 (hooks system, recommended):**

   ```toml
   [[hooks.Stop]]
   command = ["node", "/path/to/lmnr/codex-plugin/dist/hook.cjs"]
   ```

   **Older Codex versions (legacy notify):**

   ```toml
   notify = ["node", "/path/to/lmnr/codex-plugin/dist/hook.cjs"]
   ```

   The same bundle handles both invocation styles automatically.

3. Export your Laminar key in the environment Codex runs in:

   ```bash
   export LMNR_PROJECT_API_KEY="<your key>"
   ```

That's it. After each turn completes, the hook reads the new portion of the session's rollout file and exports the turn to Laminar.

## Configuration

All configuration is via environment variables. `CODEX_LMNR_*` variants exist so you can scope settings to Codex without affecting other Laminar SDKs in the same shell.

| Variable | Default | Description |
| --- | --- | --- |
| `LMNR_PROJECT_API_KEY` (or `CODEX_LMNR_PROJECT_API_KEY`) | — | Laminar project API key. If unset, the hook exits silently without exporting. |
| `LMNR_BASE_URL` (or `CODEX_LMNR_BASE_URL`) | `https://api.lmnr.ai` | Laminar API base URL (self-hosted: e.g. `http://localhost:8000`). |
| `LMNR_USER_ID` (or `CODEX_LMNR_USER_ID`) | — | Optional user id attached to every trace. |
| `CODEX_HOME` | `~/.codex` | Codex home directory (used to locate rollout files). |
| `CODEX_LMNR_STATE_DIR` | `<CODEX_HOME>/lmnr` | Where the hook keeps its state file, lock file, and log. |
| `CODEX_LMNR_MAX_CHARS` | `20000` | Max characters per captured input/output before truncation. Truncated fields record the original length and a SHA-256 of the full text. |
| `CODEX_LMNR_DEBUG` | off | Set to `1`/`true` for debug logging in `lmnr_hook.log`. |

## How it works

- Codex writes each session as a JSONL "rollout" file under `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread id>.jsonl`.
- On each hook invocation the plugin reads only bytes appended since the last run (per-session byte offset persisted in `<state dir>/lmnr_state.json`), groups rows into turns (`user message → task_complete / turn_aborted`), and exports each completed turn as a trace via OTLP/HTTP to `<base url>/v1/traces`.
- Span timestamps are backdated to the timestamps recorded in the rollout, so traces reflect when the work actually happened, not when the hook ran.
- Turns that are not yet complete (no `task_complete` yet) are held and replayed on the next invocation.
- The hook is fail-open: it always exits 0 and never blocks or breaks Codex. Errors are logged to `<state dir>/lmnr_hook.log` (rotated at 5 MB).
- Export is at-least-once: the offset is persisted only after a successful export, so a transient network failure results in a retry (and possibly duplicate spans) rather than data loss.

## Development

```bash
npm install
npm test          # node:test via tsx
npm run typecheck # tsc --noEmit
npm run build     # esbuild bundle -> dist/hook.cjs
```

`dist/hook.cjs` is committed on purpose: the hook must run via plain `node` from any Codex installation without an install step in this repo, so the bundle is the deployable artifact. Rebuild and commit it whenever `src/` changes.

## License

Apache-2.0
