# TypeScript / JavaScript instrumentation

## Contents

- Install
- Find the integrations this codebase needs
- Initialize once
- Manual spans with `observe`
- Low-level span APIs
- Trace context: user, session, metadata
- Tags
- Privacy controls
- Custom LLM spans and cost tracking
- Cross-service / async context propagation
- Flushing and shutdown

## Install

Detect the package manager from the lockfile, then install `@lmnr-ai/lmnr`:

```bash
# pnpm-lock.yaml -> pnpm add @lmnr-ai/lmnr
# yarn.lock      -> yarn add @lmnr-ai/lmnr
# package-lock.json -> npm install @lmnr-ai/lmnr
# bun.lockb      -> bun add @lmnr-ai/lmnr
```

## Find the integrations this codebase needs

Laminar's setup differs per LLM provider SDK, agent framework, runtime, and browser-automation library, and those details change between releases (and between major versions of the libraries themselves). **Do not rely on memory or on examples in this file for integration-specific wiring** — always pull the current guide.

1. **Inventory the AI stack.** Read `package.json` (every workspace package that runs traced code, in a monorepo) and grep the imports in that code. Note installed **versions** — integration setup can differ by major version. Look for:
   - LLM provider SDKs (e.g. `openai`, `@anthropic-ai/sdk`, `@google/genai`, `cohere-ai`)
   - Agent / orchestration frameworks (e.g. `ai` / `@ai-sdk/*`, `langchain` / `@langchain/*`, `@mastra/*`, `@openai/agents`, `@anthropic-ai/claude-agent-sdk`, workflow engines)
   - Browser / computer-use libraries (e.g. `@browserbasehq/stagehand`, `playwright`, `puppeteer`)
   - The runtime / app framework (e.g. Next.js, serverless platforms) — it can constrain *where* and *when* Laminar must initialize
   - Another tracing/observability SDK already in place (OpenTelemetry such as `@vercel/otel`, Langfuse, etc.)
2. **Match each one to an integration page.** Fetch the index at https://laminar.sh/docs/integrations.md (full docs index, including runtime guides: https://laminar.sh/docs/llms.txt). Integration pages live at `https://laminar.sh/docs/integrations/<name>.md` — the `.md` form returns clean markdown.
3. **Read every matching page and follow its TypeScript setup** — which modules to pass to `instrumentModules` / `Laminar.patch`, required config, initialization ordering, runtime-specific steps, and known caveats (e.g. double-tracing, or wrapping calls that already emit their own root span). Where a page and this file disagree, the page wins.
4. **Note gaps.** If a library in use has no integration page, instrument its calls manually (see [Custom LLM spans](#custom-llm-spans-and-cost-tracking)) rather than inventing an integration API. If an existing OpenTelemetry setup is present, read https://laminar.sh/docs/tracing/otel.md before wiring anything, so each call is traced by only one pipeline.

Integration pages cover integration-specific wiring only; the generic SDK APIs below apply everywhere.

## Initialize once

Call `Laminar.initialize()` as early as possible, before the traced code runs, adding whatever integration-specific options (e.g. `instrumentModules`) the integration pages call for. In TypeScript, most auto-instrumentation only works once the relevant modules are passed in — the integration page tells you exactly how.

```ts
import { Laminar } from '@lmnr-ai/lmnr';

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY,
  // instrumentModules: { ... }  // per the integration pages
  // Self-hosted Laminar (baseUrl must not include the port):
  // baseUrl: 'http://localhost',
  // httpPort: 8000,
  // grpcPort: 8001,
});
```

Spans export over gRPC by default. If you see an export error (`ECONNRESET`, `14 UNAVAILABLE`, "Protocol error"), check that `grpcPort` matches your instance — a wrong gRPC port is the usual cause, not the transport itself.

## Manual spans with `observe`

Wrap functions that represent meaningful steps. Arguments passed after the function are captured as span input (or set `input` explicitly).

```ts
import { observe } from '@lmnr-ai/lmnr';

const result = await observe(
  {
    name: 'agent.run',
    sessionId,
    userId,
    tags: ['agent', 'search'],
    metadata: { route: '/search' },
  },
  async (query, limit) => await retrieve(query, limit),
  query,
  limit,
);
```

If an integration already emits a root span for a call (many agent frameworks do), don't wrap that call in `observe` just to get a root — that adds a redundant layer. Use `observe` for your own orchestration steps around it.

## Low-level span APIs

- `Laminar.startActiveSpan(...)` — create a span that becomes the active parent for nested work.
- `Laminar.startSpan(...)` — create a detached span; activate it with `Laminar.withSpan(span, fn)`.
- Always end spans (`try/finally`). Never leak spans.

## Trace context: user, session, metadata

Set these near the start of the trace so every downstream span inherits them.

```ts
Laminar.setTraceUserId(userId);
Laminar.setTraceSessionId(sessionId);     // reuse across turns/workflows
Laminar.setTraceMetadata({ environment: process.env.NODE_ENV }); // JSON-serializable, stable keys, no PII
```

Some integrations have their own way to pass trace context — check the integration page.

## Tags

Tags are categorical, low-cardinality labels (environment, feature flag, outcome).

- At creation: `observe({ tags: [...] }, ...)` or `startSpan({ tags: [...] })`.
- Inside a span context: `Laminar.setSpanTags([...])`.
- Post-hoc (e.g. user feedback): capture the trace ID inside a span context, then later `LaminarClient.tags.tag(traceId, ...)` to tag the root span.

## Privacy controls

- Disable capture with `ignoreInput` / `ignoreOutput`, or pass an explicit `input` formatter to redact.
- Never put secrets/PII into span names, tags, or metadata.

## Custom LLM spans and cost tracking

For a provider/tool with no integration, set `spanType: 'LLM'` (or `'TOOL'`) so the UI renders it correctly, and report usage attributes for cost tracking.

```ts
import { Laminar, LaminarAttributes, observe } from '@lmnr-ai/lmnr';

await observe({ name: 'llm.call', spanType: 'LLM', input: { prompt } }, async () => {
  const response = await callModel(prompt);
  Laminar.setSpanAttributes({
    [LaminarAttributes.PROVIDER]: 'my-provider',
    [LaminarAttributes.REQUEST_MODEL]: response.model,
    [LaminarAttributes.RESPONSE_MODEL]: response.model,
    [LaminarAttributes.INPUT_TOKEN_COUNT]: response.usage?.prompt_tokens,
    [LaminarAttributes.OUTPUT_TOKEN_COUNT]: response.usage?.completion_tokens,
  });
  Laminar.setSpanOutput(response.text);
  return response;
});
```

## Cross-service / async context propagation

When you can't pass span objects directly (HTTP, queues, cron), serialize context upstream and continue downstream.

```ts
// Upstream
const context = Laminar.serializeLaminarSpanContext();
await fetch('https://service-b/api', { headers: { 'X-Laminar-Span-Context': context ?? '' } });

// Downstream
const span = Laminar.startSpan({
  name: 'serviceBHandler',
  parentSpanContext: req.headers['x-laminar-span-context'] as string | undefined,
});
try {
  // ...
} finally {
  span.end();
}
```

If the context is missing or invalid, start a new trace — never break the app. Workflow engines may have a dedicated integration that propagates context for you — check the integrations index first.

## Flushing and shutdown

- Don't flush in hot paths.
- In short-lived scripts and serverless handlers, `await Laminar.flush()` at the end so spans export before the process exits. The `await` is required.
- For one-off Node scripts, also call `await Laminar.shutdown()` when appropriate.
