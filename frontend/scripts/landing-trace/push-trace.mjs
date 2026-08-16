/**
 * Pushes the landing-page demo trace to Laminar via OTLP/HTTP JSON.
 *
 * Structural clone of the public demo trace f6593456-83c6-3c42-12dd-74cea3f22265:
 * ai.streamText root with two Gemini LLM calls around one web_search tool call.
 * Span durations and reported token counts are copied verbatim from that trace;
 * only the message content and the model differ.
 *
 * Usage:
 *   LMNR_PROJECT_API_KEY=<project key> node frontend/scripts/landing-trace/push-trace.mjs
 *
 * Options (env):
 *   LMNR_BASE_URL   ingest host, default https://api.lmnr.ai
 *   EMIT_COSTS      "true" to send provider cost attributes instead of letting
 *                   the ingest pipeline price the tokens
 *
 * Prints the generated trace id and span ids. Re-running mints fresh ids.
 */

/* global fetch */
import { randomBytes, randomUUID } from "node:crypto";

const BASE_URL = process.env.LMNR_BASE_URL ?? "https://api.lmnr.ai";
const API_KEY = process.env.LMNR_PROJECT_API_KEY;
const EMIT_COSTS = process.env.EMIT_COSTS === "true";

// Newest Gemini this repo knows about — `DEFAULT_MODELS.gemini.large` in
// frontend/lib/ai/model.ts — in Vercel AI Gateway `<provider>/<model>` form.
// It renders on the landing page, so it has to be a model that exists.
const MODEL = "google/gemini-3.1-pro-preview";
const GATEWAY_SPAN_NAME = `ai.llm gateway:${MODEL}`;

// ---------------------------------------------------------------------------
// Content — edit freely, the structure below does not depend on it.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a helpful AI assistant with access to a web_search tool.

Search the web whenever the user asks about something you might not know, or that could have changed recently. Prefer primary sources.

Keep answers short and direct. Do not pad them with caveats.`;

const USER_QUESTION = "What is Laminar?";

const LLM1_REASONING = "The user is asking what Laminar is, let me search for this.";

const TOOL_NAME = "web_search";
const TOOL_CALL_ID = "call_00_2XhqRmVdKp7wUcTaLbNs4901";
const TOOL_INPUT = { query: "Laminar" };
const TOOL_OUTPUT = {
  results: [
    {
      title: "Laminar — open-source agent observability",
      url: "https://www.lmnr.ai",
      snippet:
        "Laminar is an open-source platform for tracing, evaluating and monitoring AI agents. OpenTelemetry-native, with SQL access to every trace you send.",
    },
    {
      title: "lmnr-ai/lmnr on GitHub",
      url: "https://github.com/lmnr-ai/lmnr",
      snippet:
        "Open-source observability for AI agents. Trace every run, cluster the failures that repeat, and verify that a fix actually worked.",
    },
    {
      title: "Laminar docs — Getting started",
      url: "https://docs.lmnr.ai",
      snippet:
        "Install the SDK and call Laminar.initialize() to start sending traces. Works with the Vercel AI SDK, OpenAI, Anthropic, LangChain and more.",
    },
  ],
};

const TOOL_DEFINITIONS = [
  {
    type: "function",
    name: TOOL_NAME,
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "The search query." } },
      required: ["query"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
    description: "Search the web. Returns the top results with title, URL and a content snippet.",
  },
];

const LLM2_REASONING =
  "The results agree: Laminar is an open-source agent observability platform. Short answer, then offer to go deeper.";

const LLM2_TEXT =
  "Laminar is an open-source agent observability platform. Laminar helps agents developers by catching every agent failure, surfacing them, and verifying progress. Would you like to learn more?";

// ---------------------------------------------------------------------------
// Timing + usage, copied from the reference trace.
// ---------------------------------------------------------------------------

const MS = 1_000_000n;
const SPAN_WINDOWS_NS = {
  root: [0n, 10_454_905_500n],
  llm1: [2n * MS, 3_166_404_167n],
  tool: [3_169n * MS, 4_761_104_000n],
  llm2: [4_769n * MS, 10_447_791_584n],
};

const LLM1_USAGE = { inputTokens: 2694, outputTokens: 141, cacheReadTokens: 768, reasoningTokens: 94 };
const LLM2_USAGE = { inputTokens: 4322, outputTokens: 236, cacheReadTokens: 2816, reasoningTokens: 71 };

// Only used with EMIT_COSTS; same figures the reference's gateway reported.
const LLM1_COST = { input: 0.000840594, output: 0.00012267 };
const LLM2_COST = { input: 0.000665318, output: 0.00020532 };

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// Root span renders the whole turn: plain-string content in, one assistant message out.
const ROOT_INPUT = [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: USER_QUESTION },
];

const ROOT_OUTPUT = [
  {
    role: "assistant",
    content: [
      { type: "reasoning", text: LLM1_REASONING },
      { type: "tool-call", toolCallId: TOOL_CALL_ID, toolName: TOOL_NAME, input: TOOL_INPUT },
      {
        type: "tool-result",
        toolCallId: TOOL_CALL_ID,
        toolName: TOOL_NAME,
        input: TOOL_INPUT,
        output: TOOL_OUTPUT,
        dynamic: false,
      },
      { type: "reasoning", text: LLM2_REASONING },
      { type: "text", text: LLM2_TEXT },
    ],
  },
];

// LLM spans carry the verbatim AI SDK v7 LanguageModel prompt.
const LLM1_INPUT = [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: [{ type: "text", text: USER_QUESTION }] },
];

const LLM1_OUTPUT = [
  {
    role: "assistant",
    content: [
      { type: "reasoning", text: LLM1_REASONING },
      { type: "tool-call", toolCallId: TOOL_CALL_ID, toolName: TOOL_NAME, input: TOOL_INPUT },
    ],
  },
];

const LLM2_INPUT = [
  ...LLM1_INPUT,
  LLM1_OUTPUT[0],
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: TOOL_CALL_ID,
        toolName: TOOL_NAME,
        output: { type: "json", value: TOOL_OUTPUT },
      },
    ],
  },
];

const LLM2_OUTPUT = [
  {
    role: "assistant",
    content: [
      { type: "reasoning", text: LLM2_REASONING },
      { type: "text", text: LLM2_TEXT },
    ],
  },
];

// ---------------------------------------------------------------------------
// OTLP encoding
// ---------------------------------------------------------------------------

const hex = (bytes) => randomBytes(bytes).toString("hex");

// An 8-byte OTLP span id is left-padded to 16 bytes before it becomes a Laminar uuid.
const hexToUuid = (id) => {
  const p = id.padStart(32, "0");
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-${p.slice(12, 16)}-${p.slice(16, 20)}-${p.slice(20)}`;
};

const attrValue = (value) => {
  if (Array.isArray(value)) return { arrayValue: { values: value.map(attrValue) } };
  if (typeof value === "number") return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  return { stringValue: String(value) };
};

const toAttributes = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({ key, value: attrValue(value) }));

const SDK_ATTRS = {
  "lmnr.span.sdk_version": "0.8.38",
  "lmnr.span.language_version": "node@22.23.1",
  "lmnr.span.instrumentation_source": "javascript",
  "lmnr.span.instrumentation_scope.name": "ai",
  "lmnr.span.instrumentation_scope.version": "7.0.0",
};

function buildPayload() {
  const traceId = hex(16);
  const ids = { root: hex(8), llm1: hex(8), tool: hex(8), llm2: hex(8) };
  const uuid = Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, hexToUuid(v)]));

  // Anchor the trace slightly in the past so it is never dated in the future.
  const baseNs = (BigInt(Date.now()) - 60_000n) * MS;
  const window = (key) => {
    const [start, end] = SPAN_WINDOWS_NS[key];
    return { startTimeUnixNano: String(baseNs + start), endTimeUnixNano: String(baseNs + end) };
  };

  const llmAttrs = (usage, cost, finishReason) => ({
    "lmnr.span.type": "LLM",
    "gen_ai.system": "vercel_ai_gateway",
    "ai.model.provider": "gateway",
    "ai.model.id": MODEL,
    "gen_ai.request.model": MODEL,
    "gen_ai.response.model": MODEL,
    "gen_ai.response.id": randomUUID(),
    "gen_ai.response.finish_reason": finishReason,
    "ai.response.finishReason": finishReason,
    "gen_ai.usage.input_tokens": usage.inputTokens,
    "gen_ai.usage.output_tokens": usage.outputTokens,
    "gen_ai.usage.cache_read_input_tokens": usage.cacheReadTokens,
    "gen_ai.usage.reasoning_tokens": usage.reasoningTokens,
    "llm.usage.total_tokens": usage.inputTokens + usage.outputTokens,
    "gen_ai.usage.input_cost": EMIT_COSTS ? cost.input : undefined,
    "gen_ai.usage.output_cost": EMIT_COSTS ? cost.output : undefined,
    "gen_ai.usage.cost": EMIT_COSTS ? cost.input + cost.output : undefined,
    "gen_ai.tool.definitions": JSON.stringify(TOOL_DEFINITIONS),
    ...SDK_ATTRS,
  });

  const spans = [
    {
      traceId,
      spanId: ids.root,
      name: "ai.streamText",
      kind: 1,
      ...window("root"),
      status: { code: 1 },
      attributes: toAttributes({
        "lmnr.span.type": "DEFAULT",
        "lmnr.span.path": ["ai.streamText"],
        "lmnr.span.ids_path": [uuid.root],
        "lmnr.span.input": JSON.stringify(ROOT_INPUT),
        "lmnr.span.output": JSON.stringify(ROOT_OUTPUT),
        "ai.operation": "ai.streamText",
        "ai.model.id": MODEL,
        "gen_ai.request.model": MODEL,
        "gen_ai.system": "gateway",
        "gen_ai.response.finish_reason": "stop",
        "ai.response.finishReason": "stop",
        ...SDK_ATTRS,
      }),
    },
    {
      traceId,
      spanId: ids.llm1,
      parentSpanId: ids.root,
      name: GATEWAY_SPAN_NAME,
      kind: 1,
      ...window("llm1"),
      status: { code: 1 },
      attributes: toAttributes({
        "lmnr.span.path": ["ai.streamText", GATEWAY_SPAN_NAME],
        "lmnr.span.ids_path": [uuid.root, uuid.llm1],
        "gen_ai.input.messages": JSON.stringify(LLM1_INPUT),
        "gen_ai.output.messages": JSON.stringify(LLM1_OUTPUT),
        ...llmAttrs(LLM1_USAGE, LLM1_COST, "tool-calls"),
      }),
    },
    {
      traceId,
      spanId: ids.tool,
      parentSpanId: ids.root,
      name: TOOL_NAME,
      kind: 1,
      ...window("tool"),
      status: { code: 1 },
      attributes: toAttributes({
        "lmnr.span.type": "TOOL",
        "lmnr.span.path": ["ai.streamText", `ai.tool ${TOOL_NAME}`, TOOL_NAME],
        "lmnr.span.ids_path": [uuid.root, uuid.tool],
        "lmnr.span.input": JSON.stringify(TOOL_INPUT),
        "lmnr.span.output": JSON.stringify(TOOL_OUTPUT),
        "ai.toolCall.id": TOOL_CALL_ID,
        ...SDK_ATTRS,
      }),
    },
    {
      traceId,
      spanId: ids.llm2,
      parentSpanId: ids.root,
      name: GATEWAY_SPAN_NAME,
      kind: 1,
      ...window("llm2"),
      status: { code: 1 },
      attributes: toAttributes({
        "lmnr.span.path": ["ai.streamText", GATEWAY_SPAN_NAME],
        "lmnr.span.ids_path": [uuid.root, uuid.llm2],
        "gen_ai.input.messages": JSON.stringify(LLM2_INPUT),
        "gen_ai.output.messages": JSON.stringify(LLM2_OUTPUT),
        ...llmAttrs(LLM2_USAGE, LLM2_COST, "stop"),
      }),
    },
  ];

  const body = {
    resourceSpans: [
      {
        resource: { attributes: toAttributes({ "service.name": "laminar-landing-demo" }) },
        scopeSpans: [{ scope: { name: "ai", version: "7.0.0" }, spans }],
      },
    ],
  };

  return { traceId: hexToUuid(traceId), spanUuids: uuid, body };
}

async function main() {
  if (!API_KEY) {
    console.error("LMNR_PROJECT_API_KEY is required");
    process.exit(1);
  }

  const { traceId, spanUuids, body } = buildPayload();

  const res = await fetch(`${BASE_URL}/v1/traces`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`ingest failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  console.log(JSON.stringify({ traceId, model: MODEL, spans: spanUuids }, null, 2));
  // Sharing is a session-authed action; the URL only resolves once the trace is set public in the UI.
  console.log(`\nShare it from the trace view, then: https://laminar.sh/api/shared/traces/${traceId}`);
}

main();
