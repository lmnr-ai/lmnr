# MCP observability

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->

A company that runs an MCP server turns on one option of `Laminar.initialize`, named `mcp` in both SDKs: Python `Laminar.initialize(mcp=True)` or `mcp={"context": True, "record_payloads": True, "redact_keys": [...], "turn_gap_seconds": 20}`; TS `Laminar.initialize({ mcp: true })` or `{ mcp: { context, recordPayloads, redactKeys, turnGapMs } }`. The SDKs' MCP auto-instrumentation reads it; there is no wrapper and nothing needs a reference to the server object. The agents calling the server install nothing. The platform side is: ingestion mapping, the default "MCP" dashboard, and our own `/v1/mcp` server emitting the same spans by hand. The "MCP analysis" Signal template is enterprise (lmnr-private, `components/signals/prompts.ts`).

- **Option on (MCP observability mode):** the span contract below in full: root SERVER spans with the client's `traceparent` as a link, one trace per turn grouped by session, the optional `context` field (on by default), payloads recorded with secret-looking keys redacted, one switch to turn payloads off.
- **Option off (default):** server spans are parented on the client's `traceparent` (Python's claude_agent in-process MCP servers rely on this) and tool schemas are never changed. These spans still get the same span names, the session, client info and `error.type` (incl. `-32602`) attributes, so the MCP dashboard works for them, just without turns or `context`.

## Span contract (both SDKs in MCP observability mode, and `api/v1/mcp_tracing.rs`)

Follows the OTel GenAI MCP conventions (`open-telemetry/semantic-conventions-genai`, `docs/gen-ai/mcp.md`); Laminar attributes only where the spec has nothing.

- **Traced:** `tools/call`, `prompts/get`, `resources/read`, including failures no handler saw (unknown tool, argument validation, JSON-RPC errors). Not traced: `initialize`, `ping`, notifications, every `*/list`, subscriptions, completions. They would mint noise traces.
- **One ROOT SERVER span per request**, named `{mcp.method.name} {target}` (`tools/call search_docs`). Root because the trace view drops spans whose parent is missing (`trace-view/store/utils.ts` builds the tree from spans without a `parentSpanId`), and a client's `traceparent` usually points at a span in another system. A client `traceparent` lends its trace id and becomes a span LINK. The SDKs force a root span's trace id with an IdGenerator that honours a context-scoped override.
- **Spec attributes:** `mcp.method.name`, `gen_ai.operation.name=execute_tool` + `gen_ai.tool.name` (tools), `gen_ai.prompt.name`, `mcp.resource.uri`, `jsonrpc.request.id`, `mcp.session.id`, `mcp.protocol.version`, `network.transport`, `error.type`, `rpc.response.status_code`, `gen_ai.tool.call.arguments` / `gen_ai.tool.call.result`. The last two are lifted into the TOOL span's input/output and dropped from attributes by ingestion, so the SDKs don't also set `lmnr.span.input/output` on tool spans.
- **Laminar attributes:** `lmnr.mcp.client.name` / `lmnr.mcp.client.version` (the session's `initialize` `clientInfo`), `lmnr.mcp.context`, and `lmnr.association.properties.session_id` = `mcp.session.id`.
- **`error.type` values the dashboard depends on:** `tool_error` (`isError` result), `-32602` (invalid params: bad arguments OR unknown tool, whether the SDK answered with a JSON-RPC error or folded it into an `isError` result), other JSON-RPC codes as strings, else the exception class. Failures also get an `exception` event.
- **`context` field (on by default):** every advertised tool gets an optional string property `context` ("One sentence on what the user is trying to accomplish overall ..."), stripped before argument validation and the handler, recorded as `lmnr.mcp.context`, and KEPT in the recorded arguments: Signals read span input/output and exception events, not arbitrary attributes, so the input is how the Signal sees the user's goal. A tool that declares its own `context` is left alone. Fallback: `_meta["io.modelcontextprotocol/aiInvocation"].userIntent` (SEP-2817 draft).
- **Payloads:** recorded by default with secret-looking keys always redacted (normalized key contains `password|passwd|secret|apikey|privatekey|accesskey|authorization|credential|cookie|signature`, ends with `token` but not `tokens`, or is `auth|pwd|otp|bearer|jwt`). One switch keeps only names, counts and errors (no arguments, results, context or resource URIs).

## Turns: one trace per user turn

MCP has no end-of-turn signal. Trace id for a call, first that applies:

1. Client turn id `_meta["io.modelcontextprotocol/aiInvocation"].turnId` → first 16 bytes of SHA-256(`"{session}\n{turnId}"`). Deterministic, so every server copy agrees.
2. The session's current turn: reused while a call is in flight or the last call started/ended at most the turn gap ago (default 20 s).
3. Client `traceparent` → its trace id, only when there is no session (a new turn of a session always gets a fresh id: seeding it from a client that keeps one trace per session would give every turn the same id and undo the gap).
4. A new trace.

**The gap tracker deliberately beats the client's `traceparent`** (which is still always a span link). Measured on a live run: mcp-python 2.x's native client spans send a fresh trace id per call, so `traceparent`-first made every call its own trace; a client that keeps one trace for a whole session would merge many turns into one trace for Signals. The gap is never that wrong; only a client that sends one trace per turn does better with `traceparent`, and the gap groups those correctly too.

**The turn gap must stay under the Signals settle window** (30 s, `TRACE_EXCLUSIVE_PARK_DELAY_MS`): Signals admit a trace once it has been quiet for one park interval, so a gap >= 30 s lets a Signal run on half a turn. The SDKs clamp it to 25 s. Raising the settle interval is safe; lowering it below the gap is not.

Several server copies: (1) and (3) need no shared state. (2) lives in process memory in the SDKs, which holds for stateful Streamable HTTP (the session lives in one process, so it is pinned there anyway). Stateless servers have no session, so they have no (2) either, unless the client sends `_meta["openai/session"]`, which the SDKs use as the session id. A copy-shared turn store (the same Redis pattern `/v1/mcp` uses) is the follow-up if non-sticky stateful deployments show up.

## Ingestion mapping (`traces/spans.rs`, `traces/utils.rs`)

- `SpanAttributes::session_id()` falls back to `mcp.session.id` after `session.id`, so spec-only emitters (FastMCP / mcp-python native OTel) get Laminar sessions. An SDK-set `lmnr.association.properties.session_id` still wins.
- `is_failed_mcp_request()`: a span with `mcp.method.name` and a non-empty `error.type` is `status = error` even without an `exception` event. The spec sets `error.type` iff the operation failed, and spec-only emitters mark failures with it plus a span status Laminar doesn't read. Scoped to MCP spans on purpose: `error.type` on other emitters' spans was never read before.
- No new span-type inference (LAM-2442): `tools/call` spans are TOOL through `gen_ai.operation.name=execute_tool`.
- Ingestion renames an `execute_tool` span to its `gen_ai.tool.name` (`spans.rs`, the `execute_tool` arm), so stored MCP tool spans are named `search_docs`, not `tools/call search_docs`. Query by attributes, not names.

## Default "MCP" dashboard

- Charts: `frontend/lib/db/mcp-charts.ts` (calls per tool and per client over time; error rate, invalid-argument rate and p95 latency per tool; a tool × client table). They select `span_type = 'TOOL' AND JSONExtractString(attributes, 'mcp.method.name') = 'tools/call'`, so client-side MCP spans (e.g. the Python `McpInstrumentor` in an agent) count too.
- Created with the project by `insertProject` (`lib/workspaces/insert.ts`), right after "main" and its default charts. No app-server involvement and nothing happens on ingest; existing projects don't get it (no backfill).
- The landing dashboard is the oldest one (`getOrCreateDefaultDashboard` orders by `created_at`, then `id`), and `insertProject` runs inside the caller's transaction, where the column default `now()` is the transaction start and would tie with "main". So the MCP row's `created_at` is `GREATEST(clock_timestamp(), main.created_at + 1 µs)`: strictly later, never a tie broken by a random uuid.

## Our own `/v1/mcp` server (`api/v1/mcp_tracing.rs`)

- Off unless `MCP_SERVER_INTERNAL_PROJECT_ID` is set; when off, `context` is not advertised either. Spans are built as OTLP protos and go through `push_spans_to_queue` directly, not the internal tracing layer: `tracing-opentelemetry` can't pick a root span's trace id.
- The server is stateless (no `Mcp-Session-Id`), so turns are grouped per API key, with the turn in Redis (`mcp_server_turn:{key}`, TTL = 20 s gap, refreshed at call start and end) so every replica agrees. A turn is opened with `try_acquire_lock_with_owner` (atomic `SET NX GET`), never `get` then `insert`: parallel tool calls that open a turn would each miss the key and mint their own trace. The Laminar session is `{api key id}:{UTC day}`, the user id the caller's project. `clientInfo` from `initialize` is cached per key (`mcp_server_client:{key}`) because the following calls arrive as separate HTTP requests.
- Arguments are recorded (redacted); results are not, since they are the caller's own trace data.
- rmcp folds a parameter deserialization failure into an `isError` result (`failed to deserialize parameters: ...`), not a JSON-RPC -32602; `failure()` maps that prefix to `-32602`. An unknown tool is a real JSON-RPC -32602.
