// The one trace every landing mock renders: an assistant that searches three
// times, carries on past a 404, and answers without citing. HARDCODED,
// transcribed from the public trace this used to fetch across origins. The
// SECOND llm is answer-shaped, being the last row the opening step shows.

export type MockSpanType = "DEFAULT" | "LLM" | "TOOL";

export interface MockSpan {
  spanId: string;
  /** Absent on the run's root, which is how the root is identified. */
  parentSpanId?: string;
  name: string;
  spanType: MockSpanType;
  /** Shown in place of `name` on LLM rows, as the product does. */
  model?: string;
  /** Milliseconds from the run's start. */
  startMs: number;
  endMs: number;
  status: "success" | "error";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  cacheReadInputTokens: number;
  /** The span's output, as the transcript renders it. Rendered inline beside
   *  the name on tool rows and on its own line under LLM rows. */
  preview: string | null;
}

/** The agent's task, extracted at ingestion. Heads the transcript. */
export const DEMO_AGENT_INPUT = "What is Laminar?";

/** The FINISHED run's totals, as the trace row carries them — not a re-sum of
 *  the spans below. The stat shields climb with the run while it streams, then
 *  hand back to these so they land on the trace's own numbers. */
export const DEMO_TRACE_TOTALS = {
  durationMs: 24966,
  totalTokens: 18919,
  totalCost: 0.0200848,
};

/** The agent deciding to search — the first reasoning the reader sees. */
export const DEMO_FIRST_LLM_SPAN_ID = "00000000-0000-0000-ab62-89c1457853c7";
/** The first `web_search`. */
export const DEMO_FIRST_SEARCH_SPAN_ID = "00000000-0000-0000-53c9-930f21a1f4f2";
/** The `fetch_page` that 404s. The only span in the trace with `status: error`. */
export const DEMO_FAILED_FETCH_SPAN_ID = "00000000-0000-0000-2ea3-5b68e72ac918";
/** The third `web_search`, returning the same results as the second. */
export const DEMO_LAST_SEARCH_SPAN_ID = "00000000-0000-0000-eb47-24737685ea67";
/** The answer, citing nothing. */
export const DEMO_ANSWER_SPAN_ID = "00000000-0000-0000-f3b1-679ae064dc90";

const ROOT_SPAN_ID = "00000000-0000-0000-817e-d353ec715489";
const MODEL = "google/gemini-3.1-pro-preview";

/** A tool call: no model, no tokens, no cost — only how long it took and what
 *  it returned. Five of the ten spans are one of these, and spelling every zero
 *  out for each of them buried the numbers that do differ. */
const tool = (
  spanId: string,
  name: string,
  startMs: number,
  endMs: number,
  preview: string,
  status: MockSpan["status"] = "success"
): MockSpan => ({
  spanId,
  parentSpanId: ROOT_SPAN_ID,
  name,
  spanType: "TOOL",
  startMs,
  endMs,
  status,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  cacheReadInputTokens: 0,
  preview,
});

/** A model call. Every one in this run is the same model against the same
 *  prompt, so only the timing, the usage and the reasoning differ. */
const llm = (
  spanId: string,
  startMs: number,
  endMs: number,
  usage: Pick<MockSpan, "inputTokens" | "outputTokens" | "totalTokens" | "totalCost" | "cacheReadInputTokens">,
  preview: string
): MockSpan => ({
  spanId,
  parentSpanId: ROOT_SPAN_ID,
  name: `ai.llm gateway:${MODEL}`,
  spanType: "LLM",
  model: MODEL,
  startMs,
  endMs,
  status: "success",
  ...usage,
  preview,
});

/** In start-time order, root first. The panel reveals a prefix of this. */
export const DEMO_SPANS: MockSpan[] = [
  {
    spanId: ROOT_SPAN_ID,
    name: "ai.streamText",
    spanType: "DEFAULT",
    startMs: 0,
    endMs: 24966,
    status: "success",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    cacheReadInputTokens: 0,
    preview: null,
  },
  llm(
    DEMO_FIRST_LLM_SPAN_ID,
    2,
    3166,
    { inputTokens: 2694, outputTokens: 141, totalTokens: 2835, totalCost: 0.0056976, cacheReadInputTokens: 768 },
    "The user is asking what Laminar is, let me search for this."
  ),
  tool(DEMO_FIRST_SEARCH_SPAN_ID, "web_search", 3169, 4761, "Laminar"),
  llm(
    "00000000-0000-0000-b2e2-a6eaad38e371",
    4769,
    7181,
    { inputTokens: 3180, outputTokens: 98, totalTokens: 3278, totalCost: 0.002928, cacheReadInputTokens: 2560 },
    "Laminar is an open-source agent observability platform. Let me search further."
  ),
  tool("00000000-0000-0000-8164-0d73895d28d2", "web_search", 7189, 8633, "Laminar agent observability"),
  llm(
    "00000000-0000-0000-c216-6647a3219a64",
    8641,
    11525,
    { inputTokens: 3902, outputTokens: 126, totalTokens: 4028, totalCost: 0.0037864, cacheReadInputTokens: 3072 },
    "The docs page looks authoritative. I'll open it and read the introduction."
  ),
  tool(DEMO_FAILED_FETCH_SPAN_ID, "fetch_page", 11533, 15554, "https://laminar.sh/docs/introduction", "error"),
  llm(
    "00000000-0000-0000-2b63-00c6b2c83ca6",
    15562,
    17756,
    { inputTokens: 4108, outputTokens: 112, totalTokens: 4220, totalCost: 0.0031088, cacheReadInputTokens: 3584 },
    "The page did not load. I'll search once more rather than trying another URL."
  ),
  tool(DEMO_LAST_SEARCH_SPAN_ID, "web_search", 17764, 19272, "Laminar open source"),
  llm(
    DEMO_ANSWER_SPAN_ID,
    19280,
    24959,
    { inputTokens: 4322, outputTokens: 236, totalTokens: 4558, totalCost: 0.004564, cacheReadInputTokens: 3840 },
    "The snippets agree on what Laminar is. Short answer, then offer to go deeper."
  ),
];
