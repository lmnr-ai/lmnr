# Python instrumentation

## Contents

- Install
- Find the integrations this codebase needs
- Initialize once
- Auto-instrumentation control
- Manual spans with `@observe`
- Manual span context
- Trace context: user, session, metadata
- Tags
- Privacy controls
- Custom LLM spans and cost tracking
- Cross-service / async context propagation
- Flushing and shutdown

## Install

Detect the dependency manager and install `lmnr`:

```bash
# Poetry        -> poetry add lmnr
# uv (uv.lock)  -> uv add lmnr
# requirements.txt -> add `lmnr`, then pip install -r requirements.txt
# pip directly  -> pip install lmnr
```

Some integrations need an extra (e.g. `lmnr[<extra>]`). Don't guess which — the integration's docs page (next section) says what to install.

## Find the integrations this codebase needs

Laminar's setup differs per LLM provider SDK, agent framework, and browser-automation library, and those details change between releases. **Do not rely on memory or on examples in this file for integration-specific wiring** — always pull the current guide.

1. **Inventory the AI stack.** Read the dependency manifest (`pyproject.toml`, `requirements*.txt`, `uv.lock`, `poetry.lock`, `setup.py`) and grep the imports in the code that will be traced. Look for:
   - LLM provider SDKs (e.g. `openai`, `anthropic`, `google-genai`, `cohere`, `litellm`)
   - Agent / orchestration frameworks (e.g. `langchain`, `langgraph`, `pydantic_ai`, `openai-agents`, `google-adk`, `claude-agent-sdk`, workflow engines)
   - Browser / computer-use libraries (e.g. `browser-use`, `playwright`, `skyvern`)
   - Another tracing/observability SDK already in place (OpenTelemetry, Langfuse, etc.)
2. **Match each one to an integration page.** Fetch the index at https://laminar.sh/docs/integrations.md (full docs index: https://laminar.sh/docs/llms.txt). Integration pages live at `https://laminar.sh/docs/integrations/<name>.md` — the `.md` form returns clean markdown.
3. **Read every matching page and follow its Python setup** — install extras, initialization options, ordering constraints, and known caveats (e.g. double-tracing when a framework and its underlying provider SDK are both instrumented). Where a page and this file disagree, the page wins.
4. **Note gaps.** If a library in use has no integration page, instrument its calls manually (see [Custom LLM spans](#custom-llm-spans-and-cost-tracking)) rather than inventing an integration API. If an existing OpenTelemetry or other tracing setup is present, read https://laminar.sh/docs/tracing/otel.md before wiring anything, so each call is traced by only one pipeline.

Integration pages cover integration-specific wiring only; the generic SDK APIs below apply everywhere.

## Initialize once

Call `Laminar.initialize()` at startup, before traced code runs. Add any integration-specific options the integration pages call for.

```python
import os
from lmnr import Laminar

Laminar.initialize(
    project_api_key=os.environ["LMNR_PROJECT_API_KEY"],
    # Self-hosted Laminar:
    # base_url="http://localhost",
    # http_port=8000,
    # grpc_port=8001,
)
```

## Auto-instrumentation control

By default, Laminar auto-instruments every supported library it finds installed. Pass `instruments` to enable only a specific set, or `disabled_instruments` to turn some off. `instruments=set()` disables all auto-instrumentation.

```python
from lmnr import Laminar, Instruments

Laminar.initialize(instruments={Instruments.OPENAI})        # only these
# Laminar.initialize(disabled_instruments={Instruments.OPENAI})  # all except these
```

Use the integration pages to decide whether an override is needed — some framework instrumentations already disable overlapping provider instrumentors on their own.

## Manual spans with `@observe`

Decorate functions that represent meaningful steps.

```python
from lmnr import observe

@observe(
    name="agent.run",
    tags=["agent", "search"],
    metadata={"route": "/search"},
)
def run_agent():
    retrieve_context()

@observe(name="retrieve.context", ignore_inputs=["secrets"])  # hide sensitive args
def retrieve_context():
    ...
```

If an integration already emits a root span for a call (many agent frameworks do), don't wrap that call in `@observe` just to get a root — that adds a redundant layer. Use `@observe` for your own orchestration steps around it.

## Manual span context

For ad-hoc spans, use the context manager. For cases where you must hold a span object, use `start_span()` + `use_span()`. Always let the context manager end the span.

```python
from lmnr import Laminar

with Laminar.start_as_current_span("step", input=payload) as span:
    result = do_work(payload)
    Laminar.set_span_output(result)
```

## Trace context: user, session, metadata

Set these near the start of the trace so downstream spans inherit them.

```python
Laminar.set_trace_user_id(user_id)
Laminar.set_trace_session_id(session_id)        # reuse across turns/workflows
Laminar.set_trace_metadata({"environment": os.getenv("ENVIRONMENT")})  # JSON-serializable, stable keys, no PII
```

## Tags

Categorical, low-cardinality labels (environment, feature flag, outcome).

- At creation: `@observe(tags=[...])` or `start_as_current_span(..., tags=[...])`.
- Inside a span context: `Laminar.add_span_tags([...])`.
- Post-hoc (e.g. user feedback): capture the trace ID in a span context, then later `LaminarClient.tags.tag(trace_id, ...)`.

## Privacy controls

- Disable capture with `ignore_inputs` / `ignore_input` / `ignore_output`, or pass input/output formatters to redact.
- Never put secrets/PII into span names, tags, or metadata.

## Custom LLM spans and cost tracking

For a provider with no integration, set `span_type="LLM"` and report usage attributes so cost is tracked.

```python
from lmnr import Attributes, Laminar

with Laminar.start_as_current_span("llm.call", span_type="LLM", input=prompt):
    response = call_model(prompt)
    Laminar.set_span_output(response.text)
    Laminar.set_span_attributes({
        Attributes.PROVIDER: "my-provider",
        Attributes.REQUEST_MODEL: response.model,
        Attributes.RESPONSE_MODEL: response.model,
        Attributes.INPUT_TOKEN_COUNT: response.usage.prompt_tokens,
        Attributes.OUTPUT_TOKEN_COUNT: response.usage.completion_tokens,
    })
```

## Cross-service / async context propagation

When you can't pass span objects directly (HTTP, queues, cron), serialize context upstream and continue downstream.

```python
# Upstream
context = Laminar.serialize_span_context()
requests.post("https://service-b/api", headers={"X-Laminar-Span-Context": context or ""})

# Downstream
parent = Laminar.deserialize_span_context(request.headers.get("X-Laminar-Span-Context"))
with Laminar.start_as_current_span(name="service_b_handler", parent_span_context=parent):
    handle_request()
```

If the context is missing or invalid, start a new trace — never break the app. Workflow engines may have a dedicated integration that propagates context for you — check the integrations index first.

## Flushing and shutdown

- Don't flush in hot paths.
- In short-lived scripts, call `Laminar.flush()` at the end so spans export before the process exits.
- In serverless handlers, use `Laminar.force_flush()` when needed.
