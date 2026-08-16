/**
 * Pushes the landing-page demo trace to Laminar via OTLP/HTTP JSON.
 *
 * One ai.streamText root with nine direct children, alternating LLM call and
 * tool call: search, search again, open a docs page that 404s, search a third
 * time, answer. The 404 is never retried and the answer cites no source — the
 * landing page's signal-event card describes exactly that failure.
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

const SEARCH_TOOL = "web_search";
const FETCH_TOOL = "fetch_page";

// ---------------------------------------------------------------------------
// Content — edit freely, the structure below does not depend on it.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a helpful AI assistant with access to a web_search tool and a fetch_page tool.

Search the web whenever the user asks about something you might not know, or that could have changed recently. Prefer primary sources.

Keep answers short and direct. Do not pad them with caveats.`;

const USER_QUESTION = "What is Laminar?";

const FINAL_TEXT =
  "Laminar is an open-source agent observability platform. Laminar helps agents developers by catching every agent failure, surfacing them, and verifying progress. Would you like to learn more?";

const WIKIPEDIA_RESULT = {
  title: "Laminar flow - Wikipedia",
  url: "https://en.wikipedia.org/wiki/Laminar_flow",
  snippet: "In fluid dynamics, laminar flow is fluid moving in parallel layers with no mixing between them.",
};

const GLOSSARY_RESULT = {
  title: "Laminar Flow - an overview | ScienceDirect Topics",
  url: "https://www.sciencedirect.com/topics/engineering/laminar-flow",
  snippet: "Laminar flow occurs at low Reynolds numbers, where viscous forces dominate over inertial forces.",
};

const LMNR_HOME_RESULT = {
  title: "Laminar — open-source agent observability",
  url: "https://www.lmnr.ai",
  snippet: "Laminar is an open-source platform for tracing, evaluating and monitoring AI agents.",
};

const LMNR_GITHUB_RESULT = {
  title: "lmnr-ai/lmnr on GitHub",
  url: "https://github.com/lmnr-ai/lmnr",
  snippet: "Open-source observability for AI agents. Trace every run and cluster the failures that repeat.",
};

const LMNR_DOCS_RESULT = {
  title: "Laminar docs — Getting started",
  url: "https://docs.lmnr.ai",
  snippet: "Install the SDK and call Laminar.initialize() to start sending traces from your agent.",
};

// Searches 2 and 3 return byte-identical result sets — the redundancy is the point.
const PLATFORM_RESULTS = { results: [LMNR_HOME_RESULT, LMNR_GITHUB_RESULT, LMNR_DOCS_RESULT] };

const TOOL_DEFINITIONS = [
  {
    type: "function",
    name: SEARCH_TOOL,
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "The search query." } },
      required: ["query"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
    description: "Search the web. Returns the top results with title, URL and a content snippet.",
  },
  {
    type: "function",
    name: FETCH_TOOL,
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "The page to fetch." } },
      required: ["url"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    },
    description: "Fetch a web page and return its readable text.",
  },
];

// ---------------------------------------------------------------------------
// Turns — one LLM span each, plus the tool span it calls.
// ---------------------------------------------------------------------------

const TURNS = [
  {
    llmKey: "llm1",
    usage: { inputTokens: 2694, outputTokens: 141, cacheReadTokens: 768, reasoningTokens: 94 },
    reasoning: "The user is asking what Laminar is, let me search for this.",
    call: {
      key: "tool2",
      id: "call_00_2XhqRmVdKp7wUcTaLbNs4901",
      name: SEARCH_TOOL,
      input: { query: "Laminar" },
      output: { results: [WIKIPEDIA_RESULT, GLOSSARY_RESULT, LMNR_HOME_RESULT] },
    },
  },
  {
    llmKey: "llm3",
    usage: { inputTokens: 3180, outputTokens: 98, cacheReadTokens: 2560, reasoningTokens: 62 },
    // Answer-shaped on purpose: this is the last span the landing page's
    // opening step shows, so it has to read like a plausible end to the run
    // rather than an obvious mid-flight beat. It also sharpens the signal —
    // the agent already had the answer here and searched twice more anyway.
    reasoning: "Laminar is an open-source agent observability platform. Let me search further.",
    call: {
      key: "tool4",
      id: "call_01_7BkzTnWyQe4mPfXaHdLr2258",
      name: SEARCH_TOOL,
      input: { query: "Laminar agent observability" },
      output: PLATFORM_RESULTS,
    },
  },
  {
    llmKey: "llm5",
    usage: { inputTokens: 3902, outputTokens: 126, cacheReadTokens: 3072, reasoningTokens: 81 },
    reasoning: "The docs page looks authoritative. I'll open it and read the introduction.",
    call: {
      key: "tool6",
      id: "call_02_9FdwLpXjRb6nTgYcMsKh3374",
      name: FETCH_TOOL,
      input: { url: "https://laminar.sh/docs/introduction" },
      output: { error: "HTTP 404 Not Found" },
      failure: { type: "HTTPError", message: "HTTP 404 Not Found" },
    },
  },
  {
    llmKey: "llm7",
    usage: { inputTokens: 4108, outputTokens: 112, cacheReadTokens: 3584, reasoningTokens: 74 },
    reasoning: "The page did not load. I'll search once more rather than trying another URL.",
    call: {
      key: "tool8",
      id: "call_03_4QsvNhZmDc8rWbUaJyPt6612",
      name: SEARCH_TOOL,
      input: { query: "Laminar open source" },
      output: PLATFORM_RESULTS,
    },
  },
  {
    llmKey: "llm9",
    usage: { inputTokens: 4322, outputTokens: 236, cacheReadTokens: 3840, reasoningTokens: 71 },
    reasoning: "The snippets agree on what Laminar is. Short answer, then offer to go deeper.",
    text: FINAL_TEXT,
  },
];

// ---------------------------------------------------------------------------
// Timing, ms from trace start.
// ---------------------------------------------------------------------------

const SPAN_WINDOWS_MS = {
  root: [0, 24966],
  llm1: [2, 3166],
  tool2: [3169, 4761],
  llm3: [4769, 7181],
  tool4: [7189, 8633],
  llm5: [8641, 11525],
  tool6: [11533, 15554],
  llm7: [15562, 17756],
  tool8: [17764, 19272],
  llm9: [19280, 24959],
};

const SPAN_KEYS = Object.keys(SPAN_WINDOWS_MS);

// Only used with EMIT_COSTS; approximate Gemini Pro list pricing per million tokens.
const COST_PER_MILLION = { input: 1.25, output: 10 };
const costOf = (usage) => ({
  input: (usage.inputTokens * COST_PER_MILLION.input) / 1e6,
  output: (usage.outputTokens * COST_PER_MILLION.output) / 1e6,
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// Root span renders the whole turn: plain-string content in, one assistant message out.
const ROOT_INPUT = [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: USER_QUESTION },
];

// LLM spans carry the verbatim AI SDK v7 LanguageModel prompt, so each one sees
// every earlier assistant/tool turn; the root flattens them into one message.
function buildConversation() {
  const base = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: [{ type: "text", text: USER_QUESTION }] },
  ];

  const llmInputs = {};
  const llmOutputs = {};
  const rootParts = [];
  const history = [];

  for (const turn of TURNS) {
    llmInputs[turn.llmKey] = [...base, ...history];

    const content = [{ type: "reasoning", text: turn.reasoning }];
    if (turn.call) {
      content.push({ type: "tool-call", toolCallId: turn.call.id, toolName: turn.call.name, input: turn.call.input });
    }
    if (turn.text) content.push({ type: "text", text: turn.text });

    const assistant = { role: "assistant", content };
    llmOutputs[turn.llmKey] = [assistant];
    rootParts.push(...content);
    history.push(assistant);

    if (turn.call) {
      history.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: turn.call.id,
            toolName: turn.call.name,
            output: { type: "json", value: turn.call.output },
          },
        ],
      });
      rootParts.push({
        type: "tool-result",
        toolCallId: turn.call.id,
        toolName: turn.call.name,
        input: turn.call.input,
        output: turn.call.output,
        dynamic: false,
      });
    }
  }

  return { llmInputs, llmOutputs, rootOutput: [{ role: "assistant", content: rootParts }] };
}

// ---------------------------------------------------------------------------
// OTLP encoding
// ---------------------------------------------------------------------------

const MS = 1_000_000n;

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
  const ids = Object.fromEntries(SPAN_KEYS.map((key) => [key, hex(8)]));
  const uuid = Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, hexToUuid(v)]));

  // Anchor the trace slightly in the past so it is never dated in the future.
  const baseNs = (BigInt(Date.now()) - 60_000n) * MS;
  const window = (key) => {
    const [start, end] = SPAN_WINDOWS_MS[key];
    return {
      startTimeUnixNano: String(baseNs + BigInt(start) * MS),
      endTimeUnixNano: String(baseNs + BigInt(end) * MS),
    };
  };

  // Laminar derives status = 'error' from an `exception` event, not from status.code.
  const exceptionEvent = (key, failure) => [
    {
      timeUnixNano: String(baseNs + BigInt(SPAN_WINDOWS_MS[key][1]) * MS),
      name: "exception",
      attributes: toAttributes({
        "exception.type": failure.type,
        "exception.message": failure.message,
        "exception.escaped": false,
      }),
    },
  ];

  const { llmInputs, llmOutputs, rootOutput } = buildConversation();

  const llmAttrs = (usage, finishReason) => {
    const cost = costOf(usage);
    return {
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
    };
  };

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
        "lmnr.span.output": JSON.stringify(rootOutput),
        "ai.operation": "ai.streamText",
        "ai.model.id": MODEL,
        "gen_ai.request.model": MODEL,
        "gen_ai.system": "gateway",
        "gen_ai.response.finish_reason": "stop",
        "ai.response.finishReason": "stop",
        ...SDK_ATTRS,
      }),
    },
  ];

  for (const turn of TURNS) {
    spans.push({
      traceId,
      spanId: ids[turn.llmKey],
      parentSpanId: ids.root,
      name: GATEWAY_SPAN_NAME,
      kind: 1,
      ...window(turn.llmKey),
      status: { code: 1 },
      attributes: toAttributes({
        "lmnr.span.path": ["ai.streamText", GATEWAY_SPAN_NAME],
        "lmnr.span.ids_path": [uuid.root, uuid[turn.llmKey]],
        "gen_ai.input.messages": JSON.stringify(llmInputs[turn.llmKey]),
        "gen_ai.output.messages": JSON.stringify(llmOutputs[turn.llmKey]),
        ...llmAttrs(turn.usage, turn.call ? "tool-calls" : "stop"),
      }),
    });

    if (!turn.call) continue;

    spans.push({
      traceId,
      spanId: ids[turn.call.key],
      parentSpanId: ids.root,
      name: turn.call.name,
      kind: 1,
      ...window(turn.call.key),
      status: { code: turn.call.failure ? 2 : 1 },
      events: turn.call.failure ? exceptionEvent(turn.call.key, turn.call.failure) : undefined,
      attributes: toAttributes({
        "lmnr.span.type": "TOOL",
        "lmnr.span.path": ["ai.streamText", `ai.tool ${turn.call.name}`, turn.call.name],
        "lmnr.span.ids_path": [uuid.root, uuid[turn.call.key]],
        "lmnr.span.input": JSON.stringify(turn.call.input),
        "lmnr.span.output": JSON.stringify(turn.call.output),
        "ai.toolCall.id": turn.call.id,
        ...SDK_ATTRS,
      }),
    });
  }

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
