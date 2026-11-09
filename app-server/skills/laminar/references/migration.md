# Migrating to Laminar

Move an existing observability setup (Langfuse, LangSmith, Helicone, or raw OpenTelemetry) to Laminar with minimal diffs, preserving trace semantics.

## Workflow

1. Identify the current provider, runtime, and entrypoints. Capture trace boundaries and existing context (user/session IDs, tags, metadata, redaction rules).
2. Choose the approach:
   - **OpenTelemetry already in use** → keep instrumentation, redirect the OTLP exporter to Laminar (see below).
   - **SDK wrappers/decorators** → replace with Laminar `observe()` / `@observe()` or manual spans, and enable provider auto-instrumentation.
   - Either way, **avoid double-instrumentation** — don't run two tracers over the same calls.
3. Install Laminar with the repo's package manager. Add `LMNR_PROJECT_API_KEY` (and `LMNR_BASE_URL` if self-hosted) to env examples; never commit secrets.
4. Map concepts and naming: stable, low-cardinality span names; tags low-cardinality; identifiers in metadata or the dedicated `user_id`/`session_id` fields.
5. Verify: run a representative flow and confirm root span, child spans, and tags appear in the UI, with context preserved end-to-end.

For the Laminar API details referenced below (initialize, observe, trace context, tags, privacy, flushing), read [instrumentation-typescript.md](instrumentation-typescript.md) or [instrumentation-python.md](instrumentation-python.md).

## Concept mapping

Preserve these invariants while switching:

- Keep the same trace boundary (request/job/turn).
- Keep span names stable and low-cardinality; put IDs in metadata.
- Prefer Laminar's trace-level `user_id` / `session_id` fields (separate from metadata) when you have those IDs.
- Keep tags low-cardinality (environment, feature flags, outcome).

### Langfuse

- Trace → Laminar trace; Observation → Laminar span; Tags → span tags; Metadata → trace metadata.
- Replace Langfuse wrappers with `observe()` / `@observe()` or manual spans. Set user/session IDs early so downstream spans inherit. Move IDs from names into metadata.

### LangSmith

- Run → Laminar trace; Run ID → trace metadata; Tags → span tags.
- Replace `@traceable` / run wrappers with Laminar `observe()` / `@observe()`. Preserve run tags as span tags; store run IDs and I/O in metadata when needed.

### Helicone

Helicone uses proxy headers, not SDK spans. Migration means: remove the Helicone proxy/middleware, initialize Laminar with provider auto-instrumentation, and add manual spans around orchestration to restore structure.

### OpenTelemetry (keep spans, swap exporter)

If you already emit OTEL spans, keep the instrumentation and redirect export to Laminar:

1. Keep existing OTEL instrumentation and attributes in place.
2. Point the OTLP exporter at your Laminar instance (OTLP/gRPC recommended).
3. Set the Laminar API key in the exporter auth header/metadata. In Node gRPC this is exporter metadata; in Python the header key must be lowercase `authorization`.
4. Validate with a representative flow. If you see duplicate spans, a second tracer/auto-instrumentation is still running — remove it.

Use the exact OTLP endpoint and headers documented for your deployment (cloud vs self-hosted):

- https://laminar.sh/docs/tracing/otel
- https://laminar.sh/docs/tracing/troubleshooting-opentelemetry
