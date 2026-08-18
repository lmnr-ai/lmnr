// The one trace every landing mock renders, hardcoded.
//
// An assistant asked "What is Laminar?" that searches, searches again, opens a
// docs page that 404s, searches a third time, and answers from a snippet
// without citing it. Those three failures are what the signal-event card
// describes.
//
//   ai.streamText
//   ├─ ai.llm    "let me search for this"           → web_search "Laminar"
//   ├─ ai.llm    answers, "let me search further"   → web_search "Laminar agent observability"
//   ├─ ai.llm    "the docs page looks authoritative"→ fetch_page  ← 404, never retried
//   ├─ ai.llm    "search once more instead"         → web_search "Laminar open source"
//   └─ ai.llm    the answer, citing nothing
//
// The second LLM span is answer-shaped deliberately: it is the last row the
// scrollytell's opening step shows, so it has to read like a plausible end to
// the run. See OPENING_SPANS in ./understand-why-trace-view.
//
// HARDCODED, not fetched. It used to be read live off a public trace on
// laminar.sh through an `/api/landing-traces` rewrite, which put a marketing
// page's first impression behind a cross-origin request, a share flag someone
// could revoke, and the product's own span/preview response shapes. The numbers
// below are that trace, transcribed — durations in ms from the run's start,
// which is the only form ./understand-why-trace-view/mock needs.

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
  {
    spanId: DEMO_FIRST_LLM_SPAN_ID,
    parentSpanId: ROOT_SPAN_ID,
    name: `ai.llm gateway:${MODEL}`,
    spanType: "LLM",
    model: MODEL,
    startMs: 2,
    endMs: 3166,
    status: "success",
    inputTokens: 2694,
    outputTokens: 141,
    totalTokens: 2835,
    totalCost: 0.0056976,
    cacheReadInputTokens: 768,
    preview: "The user is asking what Laminar is, let me search for this.",
  },
  {
    spanId: DEMO_FIRST_SEARCH_SPAN_ID,
    parentSpanId: ROOT_SPAN_ID,
    name: "web_search",
    spanType: "TOOL",
    startMs: 3169,
    endMs: 4761,
    status: "success",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    cacheReadInputTokens: 0,
    preview: "Laminar",
  },
  {
    spanId: "00000000-0000-0000-b2e2-a6eaad38e371",
    parentSpanId: ROOT_SPAN_ID,
    name: `ai.llm gateway:${MODEL}`,
    spanType: "LLM",
    model: MODEL,
    startMs: 4769,
    endMs: 7181,
    status: "success",
    inputTokens: 3180,
    outputTokens: 98,
    totalTokens: 3278,
    totalCost: 0.002928,
    cacheReadInputTokens: 2560,
    preview: "Laminar is an open-source agent observability platform. Let me search further.",
  },
  {
    spanId: "00000000-0000-0000-8164-0d73895d28d2",
    parentSpanId: ROOT_SPAN_ID,
    name: "web_search",
    spanType: "TOOL",
    startMs: 7189,
    endMs: 8633,
    status: "success",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    cacheReadInputTokens: 0,
    preview: "Laminar agent observability",
  },
  {
    spanId: "00000000-0000-0000-c216-6647a3219a64",
    parentSpanId: ROOT_SPAN_ID,
    name: `ai.llm gateway:${MODEL}`,
    spanType: "LLM",
    model: MODEL,
    startMs: 8641,
    endMs: 11525,
    status: "success",
    inputTokens: 3902,
    outputTokens: 126,
    totalTokens: 4028,
    totalCost: 0.0037864,
    cacheReadInputTokens: 3072,
    preview: "The docs page looks authoritative. I'll open it and read the introduction.",
  },
  {
    spanId: DEMO_FAILED_FETCH_SPAN_ID,
    parentSpanId: ROOT_SPAN_ID,
    name: "fetch_page",
    spanType: "TOOL",
    startMs: 11533,
    endMs: 15554,
    status: "error",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    cacheReadInputTokens: 0,
    preview: "https://laminar.sh/docs/introduction",
  },
  {
    spanId: "00000000-0000-0000-2b63-00c6b2c83ca6",
    parentSpanId: ROOT_SPAN_ID,
    name: `ai.llm gateway:${MODEL}`,
    spanType: "LLM",
    model: MODEL,
    startMs: 15562,
    endMs: 17756,
    status: "success",
    inputTokens: 4108,
    outputTokens: 112,
    totalTokens: 4220,
    totalCost: 0.0031088,
    cacheReadInputTokens: 3584,
    preview: "The page did not load. I'll search once more rather than trying another URL.",
  },
  {
    spanId: DEMO_LAST_SEARCH_SPAN_ID,
    parentSpanId: ROOT_SPAN_ID,
    name: "web_search",
    spanType: "TOOL",
    startMs: 17764,
    endMs: 19272,
    status: "success",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    cacheReadInputTokens: 0,
    preview: "Laminar open source",
  },
  {
    spanId: DEMO_ANSWER_SPAN_ID,
    parentSpanId: ROOT_SPAN_ID,
    name: `ai.llm gateway:${MODEL}`,
    spanType: "LLM",
    model: MODEL,
    startMs: 19280,
    endMs: 24959,
    status: "success",
    inputTokens: 4322,
    outputTokens: 236,
    totalTokens: 4558,
    totalCost: 0.004564,
    cacheReadInputTokens: 3840,
    preview: "The snippets agree on what Laminar is. Short answer, then offer to go deeper.",
  },
];
