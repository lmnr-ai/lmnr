# Trace generator for the Laminar trace-view video

Runs a small Vercel AI SDK coding agent against a dummy Express API. The run
sends one trace to the Laminar `kolbe-test` project. `trace-view-video.md` holds
the storyboard this trace must satisfy.

## The task

The user prompt is one line:

> Hey, can you add pagination to my REST endpoint and test it?

`sandbox/` holds a small Express API. `GET /api/posts` already paginates and
uses the shared `parsePagination` helper. `GET /api/users` does not. The agent
must find the gap, copy the house style, and delegate the tests.

## Run it

```sh
./reset.sh        # restore sandbox/ from .sandbox-pristine
pnpm agent
```

`reset.sh` matters. The agent edits `sandbox/` in place, so a second run starts
from an already-paginated file and takes a different path.

## Layout

| Path                    | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `src/run.ts`            | Entry point. Runs the agent, flushes Laminar.     |
| `src/agent.ts`          | Lead agent and the nested `test-writer` subagent. |
| `src/tools.ts`          | The six tools. Inner work emits DEFAULT spans.    |
| `src/instrumentation.ts`| Registers Laminar as a global AI SDK receiver.    |
| `sandbox/`              | The dummy Express API the agent edits.            |
| `.sandbox-pristine/`    | Clean copy. `reset.sh` restores from here.        |

## How the spans are shaped

Three span types drive the video, and each comes from a different place.

- **LLM** spans come from the AI SDK. `registerAiSdkTelemetry()` receives them.
- **TOOL** spans come from the AI SDK too, one per tool execution.
- **DEFAULT** spans are manual. Each tool wraps its real work in `observe()`,
  so `read_file` emits `fs.readFile`, `grep` emits `ripgrep.exec`, and so on.
  These are the spans the video hides at the "un-tree everything" beat.

Use `registerAiSdkTelemetry()`, not `wrapAISDK()`. `ToolLoopAgent` calls
`generateText` from inside the `ai` bundle, so `wrapAISDK` cannot reach it.

Subagent nesting is automatic. Laminar's `executeTool` hook runs each tool
inside the TOOL span's context, so the subagent's `generateText` reparents under
`spawn_subagent`.

## Config

`.env` holds both keys. `LMNR_PROJECT_API_KEY` comes from
`lmnr-cli project link`. `GOOGLE_GENERATIVE_AI_API_KEY` was copied from
`../lmnr-01/frontend/.env`.

Set `MODEL` to change the model. It defaults to `gemini-3.7-flash`. Thinking is
on with `thinkingLevel: 'high'` and `includeThoughts: true`, which is what puts
a thought summary on every LLM span.

## Inspect the result

```sh
LMNR=/Users/kolbeyang/Documents/Programming/lmnr-ts/packages/lmnr-cli/dist/index.cjs
node $LMNR sql query "SELECT span_type, count(*) FROM spans WHERE trace_id='<id>' GROUP BY span_type" --pretty
```
