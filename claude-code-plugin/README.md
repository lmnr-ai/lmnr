# Laminar plugin for Claude Code

Trace your [Claude Code](https://claude.com/claude-code) sessions in [Laminar](https://www.lmnr.ai).

Every conversational turn becomes a Laminar trace with:

- a root span carrying the user prompt and the final assistant response,
- one LLM span per assistant message, with model name and token usage (input, output, cache read/write),
- one tool span per tool execution, with tool input and result,
- subagent (Task/Agent tool) transcripts nested under their launching tool span,
- session grouping — all turns of one Claude Code session share a Laminar session id.

The plugin runs on the `Stop` and `SessionEnd` hooks, reads the session transcript
incrementally, and ships spans to Laminar over OTLP/HTTP/JSON using the
OpenTelemetry SDK. It is written in TypeScript and ships as a single
dependency-free JavaScript bundle (`dist/hook.cjs`), run on Node — which Claude
Code already requires — so there is nothing to install after adding the plugin. It
fails open: if Laminar is unreachable or anything goes wrong, Claude Code is never
blocked or slowed down by more than a few seconds.

## Installation

```
claude plugin marketplace add lmnr-ai/lmnr-claude-code-plugin
claude plugin install laminar@laminar
```

When prompted during install, paste your Laminar project API key (create one in
your project settings at [lmnr.ai](https://www.lmnr.ai)). No `npm install` is
needed — the runtime bundle is committed to the plugin.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `LMNR_PROJECT_API_KEY` | — (required) | Laminar project API key |
| `LMNR_BASE_URL` | `https://api.lmnr.ai` | Laminar API base URL; for self-hosted use e.g. `http://localhost:8000` |
| `CC_LMNR_USER_ID` | — | Optional user id attached to traces |
| `CC_LMNR_DEBUG` | `false` | Write debug logs to `~/.claude/state/lmnr_hook.log` |
| `CC_LMNR_MAX_CHARS` | `20000` | Max characters per captured text field |
| `CC_LMNR_STATE_DIR` | `~/.claude/state` | Directory for the per-session state file, lock, and debug log |

Options can be set in the plugin config or as plain environment variables. If
you already have `LMNR_PROJECT_API_KEY` exported in your shell, the plugin picks
it up automatically.

## How it works

- **Stop hook** — fires after each assistant response; the plugin reads the new
  portion of the transcript (tracked by byte offset in
  `~/.claude/state/lmnr_state.json`), assembles complete turns, and emits them.
- **SessionEnd hook** — flushes any turns still deferred (e.g. waiting for
  background agent notifications).
- Turns that launched an async agent are deferred until the agent's task
  notification arrives, so the subagent's full trace lands under the right
  tool span.

## Development

```
npm install
npm test          # tsx --test tests/*.test.ts
npm run typecheck # tsc --noEmit
npm run build     # esbuild -> dist/hook.cjs (commit this)
```

`dist/hook.cjs` is a committed build artifact — the hooks run it directly, so
re-run `npm run build` and commit the result after changing anything in `src/`.

## License

Apache-2.0
