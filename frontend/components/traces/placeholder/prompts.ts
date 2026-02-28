export const LAMINAR_INSTALL_FROM_SCRATCH = `
Instrument this codebase with Laminar tracing. Docs: https://docs.laminar.sh

## Goal

One trace per agent run. Every request/turn produces a single span tree showing the full execution — your logic, every LLM call, tool use, retrieval, and sub-agent work — not scattered isolated spans.

\`\`\`
@observe handle_turn          → root (your entry point)
├── @observe route_request    → your logic
│   ├── @observe search       → your tool
│   │   ├── embedding call    → auto-instrumented
│   │   └── rerank call       → auto-instrumented
│   └── LLM call              → auto-instrumented
└── @observe format_response  → your logic
\`\`\`

- **Root span**: \`@observe\`/\`observe()\` on the entry point of each agent run.
- **Leaves**: LLM calls and framework ops are auto-instrumented as child spans.
- **Branches**: \`@observe\`/\`observe()\` on your own functions (routing, tools, pipelines) to give the tree structure.
- **Context**: user ID, session ID, metadata — set once at the root, inherited by all children.

## 1 — Install

Detect the language and package manager. Install using the project's conventions.

- Python: \`lmnr\` (use \`[all]\` extra for broad support, or specific extras like \`[openai]\`, \`[anthropic]\`)
- TypeScript: \`@lmnr-ai/lmnr\`

Ask the user to provide their Laminar project API key and add it as \`LMNR_PROJECT_API_KEY\` to the project's environment configuration. Do not commit it to version control.

## 2 — Initialize

Call once, at the entry point, **before** creating any LLM clients.

**Python** (auto-detects installed libraries):

\`\`\`python
from lmnr import Laminar
Laminar.initialize()
\`\`\`

**TypeScript** (must pass modules explicitly):

\`\`\`typescript
import { Laminar } from '@lmnr-ai/lmnr';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY,
  instrumentModules: {
    OpenAI: OpenAI,
    anthropic: Anthropic,
    // stagehand: Stagehand, puppeteer: puppeteer,
    // playwright: { chromium }, kernel: Kernel,
  },
});
\`\`\`

**Next.js** — requires three pieces:

1. \`instrumentation.ts\` at project root:
\`\`\`typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { Laminar } = await import('@lmnr-ai/lmnr');
    Laminar.initialize({ projectApiKey: process.env.LMNR_PROJECT_API_KEY });
  }
}
\`\`\`

2. \`next.config.ts\` — add \`serverExternalPackages: ['@lmnr-ai/lmnr']\`. For Next.js < 15, also add \`experimental: { instrumentationHook: true }\`.

3. Patch LLM SDKs where you create clients (instrumentation.ts imports are isolated):
\`\`\`typescript
import { Laminar } from '@lmnr-ai/lmnr';
import OpenAI from 'openai';
Laminar.patch({ OpenAI: OpenAI });
export const openai = new OpenAI();
\`\`\`

**Vercel AI SDK** — pass the Laminar tracer to every \`generateText\`/\`streamText\` call:

\`\`\`typescript
import { getTracer } from '@lmnr-ai/lmnr';
const { text } = await generateText({
  model: openai('gpt-4.1-nano'),
  prompt: '...',
  experimental_telemetry: { isEnabled: true, tracer: getTracer() },
});
\`\`\`

Use \`observe()\` to group multiple AI SDK calls under one trace in a route handler.

## 3 — Auto-instrumented integrations (do NOT manually trace these)

These are traced automatically after initialization. Do not wrap their calls with \`@observe\`.

| Integration | Lang | Notes |
|---|---|---|
| **OpenAI** | TS+Py | TS: \`instrumentModules: { OpenAI }\`. Py: auto. |
| **Anthropic** | TS+Py | TS: \`instrumentModules: { anthropic }\` (lowercase key). Py: auto. |
| **Google Gemini** | Py | Auto. |
| **Cohere** | Py | Auto. Chat, Embed, Rerank. |
| **LiteLLM** | Py | Auto. Remove deprecated \`LaminarLiteLLMCallback\`. |
| **OpenRouter** | TS+Py | Use OpenAI SDK with \`baseURL: 'https://openrouter.ai/api/v1'\`. |
| **LangChain/LangGraph** | Py | Auto. Chains, agents, tools, graph nodes. |
| **Vercel AI SDK** | TS | Pass \`getTracer()\` via \`experimental_telemetry\` (see above). |
| **Pydantic AI** | Py | Configure OTLP exporter → \`https://api.lmnr.ai:8443/v1/traces\`, then \`Agent.instrument_all()\`. |
| **Claude Agent SDK** | TS+Py | TS: \`Laminar.wrapClaudeAgentQuery(origQuery)\`. Py: auto. |
| **OpenHands SDK** | Py | Fully automatic when \`LMNR_PROJECT_API_KEY\` is set. |
| **Browser Use** | Py | Auto. Agent steps + browser session recordings. |
| **Stagehand** | TS | \`instrumentModules: { stagehand: Stagehand }\`. Session recordings + LLM cost. |
| **Puppeteer** | TS | \`instrumentModules: { puppeteer }\`. Session recordings. |
| **Playwright** | TS+Py | TS: \`instrumentModules: { playwright: { chromium } }\`. Py: auto. |
| **Skyvern** | Py | Auto. LLM calls, browser recordings, workflow steps. |
| **Kernel** | TS+Py | TS: \`instrumentModules: { kernel: Kernel }\`. Py: auto. |

## 4 — Observe your own code (most important step)

Without this, auto-instrumented LLM calls have no parent and each becomes its own trace.

**Python:**
\`\`\`python
from lmnr import observe

@observe()
def handle_turn(user_input: str) -> str:
    return format_response(route_request(user_input))

@observe()
def route_request(user_input: str):
    if needs_search(user_input):
        return search(user_input)
    return chat(user_input)

@observe()
def search(query: str):
    docs = retrieve(query)
    response = client.chat.completions.create(...)  # auto-instrumented leaf
    return response.choices[0].message.content
\`\`\`

**TypeScript:**
\`\`\`typescript
import { observe } from '@lmnr-ai/lmnr';

const handleTurn = (input: string) =>
  observe({ name: 'handleTurn' }, async () => {
    return formatResponse(await routeRequest(input));
  });
\`\`\`

**Wrap**: entry points, orchestration/routing, tool implementations, RAG pipelines, sub-agent calls.
**Don't wrap**: LLM SDK calls (auto-instrumented), framework internals (auto-instrumented), trivial utils.
**Sensitive data**: use \`@observe(ignore_input=True, ignore_output=True)\` / \`observe({ ignoreInput: true, ignoreOutput: true })\`.

## 5 — Trace context

Set inside the root observed function. Applies to the entire trace.

**Python:**
\`\`\`python
from lmnr import Laminar, observe

@observe()
def handle_request(user_id: str, conversation_id: str, user_input: str):
    Laminar.set_trace_user_id(user_id)
    Laminar.set_trace_session_id(conversation_id)  # groups turns into a conversation
    Laminar.set_trace_metadata({"environment": os.getenv("ENVIRONMENT", "development")})
    return run_agent(user_input)
\`\`\`

**TypeScript:**
\`\`\`typescript
const handleRequest = (userId: string, convId: string, input: string) =>
  observe({ name: 'handleRequest', userId, sessionId: convId }, async () => {
    Laminar.setTraceMetadata({ environment: process.env.NODE_ENV });
    return runAgent(input);
  });
\`\`\`

**Tags** — categorical labels on individual spans: \`@observe(tags=["beta"])\` / \`observe({ tags: ['beta'] })\`. Dynamically: \`Laminar.add_span_tags([...])\` (Py) / \`Laminar.setSpanTags([...])\` (TS).

## 6 — Cross-service traces (if applicable)

If a run spans multiple services, serialize span context upstream and deserialize downstream to keep one trace.

**Py:** \`Laminar.serialize_span_context()\` → pass via header → \`Laminar.deserialize_span_context(ctx)\` → \`Laminar.start_as_current_span(parent_span_context=parent)\`.
**TS:** \`Laminar.serializeLaminarSpanContext()\` → pass via header → \`Laminar.startSpan({ parentSpanContext })\`.

Skip if the agent runs in one process.

## 7 — Flush (serverless/CLI only)

Long-running servers don't need this. For short-lived processes, flush before exit:

- **Py:** \`Laminar.force_flush()\` (serverless) / \`Laminar.flush()\` (CLI) / \`Laminar.shutdown()\` (final)
- **TS:** \`await Laminar.flush()\` / \`await Laminar.shutdown()\`

## 8 — Verify

Trigger a request and confirm the trace shows: a single root span, intermediate spans for your logic, leaf spans for LLM calls, all in one tree, with user/session/metadata attached.

If LLM calls appear as separate top-level traces, you're missing an \`@observe\` on the calling function.

## Rules

- Initialize once, before any LLM clients.
- TS must pass modules to \`instrumentModules\`. Python auto-detects.
- Don't double-instrument auto-traced libraries.
- \`@observe\`/\`observe()\` only on your own code.
- **Every agent run must have a root span.** Without it, nothing nests.
- Set context inside the root span.
- Next.js: \`instrumentation.ts\` + \`Laminar.patch()\` + \`getTracer()\` for AI SDK.
- Serverless/CLI: flush before exit.`.trimStart();

export const LAMINAR_MIGRATION_PROMPT = `
You are a coding agent (Claude Code / Codex). Your job is to migrate my existing observability/tracing setup to Laminar with minimal diffs, preserving semantics and making traces easy to analyze in Laminar.

## What I will provide
- The current observability tool (Langfuse, LangSmith, Helicone, custom OpenTelemetry, etc.)
- Language/runtime and framework/entrypoints
- The repo/code where current tracing is implemented (middleware, decorators, wrappers)
- Any requirements we rely on today: user/session tracking, tags/labels, metadata, evaluation runs, redaction rules

## Migration goals
- Keep the same trace boundaries (what counts as one trace/run) unless there's a clear improvement.
- Preserve span naming semantics (stable names; no high-cardinality IDs in span names).
- Ensure Laminar captures LLM spans (and tool spans) reliably via initialization/patching.
- Map context correctly:
  - User/session: Laminar.setTraceUserId / set_trace_user_id and Laminar.setTraceSessionId / set_trace_session_id (or observe() options where appropriate)
  - Metadata: Laminar trace metadata (setTraceMetadata / set_trace_metadata), set early so it applies to the whole trace
  - Tags: Laminar span tags (tags option at creation, or setSpanTags / add_span_tags inside span context)
- Avoid double-instrumentation (don't run two tracer SDKs that both instrument the same calls).
- Maintain privacy constraints (use ignoreInput/ignoreOutput or redaction formatters; never put PII in names/tags/metadata).

## Your tasks
1) Identify the current tool and mapping
- Identify the constructs in the current tool (trace/span/observation, tags, metadata, sessions).
- Propose a mapping to Laminar concepts and APIs.

2) Implement the migration
- Remove/disable the old SDK where possible.
- Install Laminar with the repo's package manager and add LMNR_PROJECT_API_KEY env wiring.
- If self-hosted, set LMNR_BASE_URL (or pass baseUrl/base_url to Laminar.initialize and LaminarClient).
- Add Laminar.initialize at the right entrypoint(s) so auto-instrumentation works.
- Replace tracing wrappers/decorators with Laminar observe() / @observe() or manual spans as needed.
- If the repo already uses OpenTelemetry exporters, configure OTLP export to Laminar (OTLP/gRPC recommended) and ensure Authorization is set correctly.

3) Verify
- Provide exact commands to run and what to check in the UI (trace structure, LLM spans, tags/metadata present, no noisy spans explosion).

## Deliverables
- A patch-style diff (or concrete file edits), plus a short explanation of each change.
- A verification checklist.
- If I ask: include guidance for migrating evaluations to Laminar evaluate() and running them via lmnr eval / npx lmnr eval.

Now, here is my repo context + code:
[PASTE HERE]
`.trimStart();
