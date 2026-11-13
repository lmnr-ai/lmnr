export type TraceHealthCategory = "evals" | "cost" | "grouping";

/** Stable slugs: they are stored in `projects.settings.hiddenTraceHealthChecks`, so never rename one. */
export const TRACE_HEALTH_CHECK_IDS = [
  "llm-missing-input",
  "llm-missing-output",
  "tool-missing-output",
  "multiple-root-spans",
  "llm-missing-model",
  "llm-missing-usage",
  "llm-missing-cost",
  "traces-missing-session",
] as const;

export type TraceHealthCheckId = (typeof TRACE_HEALTH_CHECK_IDS)[number];

import { type Filter } from "@/lib/actions/common/filter-schemas";
import { Operator } from "@/lib/actions/common/operators";

/**
 * Where "View in table" opens. `filters` reproduce the check with table filters; checks the filters
 * can't express (empty payloads, root-span counts) list the matching ids under `idColumn` instead.
 */
export type TraceHealthTableLink =
  | { view: "traces" | "spans"; filters: Filter[] }
  | { view: "traces"; idColumn: "id" }
  | { view: "spans"; idColumn: "span_id" };

export interface TraceHealthCheck {
  id: TraceHealthCheckId;
  category: TraceHealthCategory;
  /** Neutral label, used where the check passed. */
  name: string;
  title: string;
  impact: string;
  fix: string;
  /** What `applicable` counts, e.g. "LLM spans". */
  unit: string;
  /** In-app page that fixes the issue, relative to the project root. */
  link?: { label: string; path: string };
  docsUrl?: string;
  table: TraceHealthTableLink;
}

const LLM_SPANS: Filter = { column: "span_type", operator: Operator.Eq, value: "LLM", dataType: "string" };

export interface TraceHealthCategoryInfo {
  title: string;
  /** Advisory categories are listed in the dialog but don't light up the "issues detected" button. */
  advisory: boolean;
}

export const TRACE_HEALTH_CATEGORIES: Record<TraceHealthCategory, TraceHealthCategoryInfo> = {
  evals: {
    title: "General",
    advisory: false,
  },
  cost: {
    title: "Cost tracking",
    advisory: false,
  },
  grouping: {
    title: "Suggestions",
    advisory: true,
  },
};

export const TRACE_HEALTH_CHECKS: TraceHealthCheck[] = [
  {
    id: "llm-missing-input",
    name: "LLM span input",
    category: "evals",
    title: "LLM spans are missing input",
    impact: "Traces are missing the prompt sent to the model.",
    fix: "Record the request messages on each LLM span (gen_ai.input.messages, or lmnr.span.input via the Laminar SDK).",
    unit: "LLM spans",
    table: { view: "spans", idColumn: "span_id" },
  },
  {
    id: "llm-missing-output",
    name: "LLM span output",
    category: "evals",
    title: "LLM spans are missing output",
    impact: "Traces are missing the model's response.",
    fix: "Record the response messages on each LLM span (gen_ai.output.messages, or lmnr.span.output via the Laminar SDK).",
    unit: "LLM spans",
    table: { view: "spans", idColumn: "span_id" },
  },
  {
    id: "tool-missing-output",
    name: "Tool span output",
    category: "evals",
    title: "Tool spans are missing output",
    impact: "Traces are missing what tool calls returned.",
    fix: "Record the tool result on each tool span (gen_ai.tool.call.result, or wrap the tool with Laminar's observe so its return value is captured).",
    unit: "tool spans",
    table: { view: "spans", idColumn: "span_id" },
  },
  {
    id: "multiple-root-spans",
    name: "Single root span per trace",
    category: "evals",
    title: "Traces have multiple root spans",
    impact: "Runs are split into disconnected pieces.",
    fix: "Propagate the active span context across async boundaries, threads and service calls so child spans attach to their parent.",
    unit: "traces",
    table: { view: "traces", idColumn: "id" },
  },
  {
    id: "llm-missing-model",
    name: "LLM span model",
    category: "cost",
    title: "LLM spans are missing the model",
    impact: "Costs can't be computed and spans can't be filtered by model.",
    fix: "Set gen_ai.request.model (or gen_ai.response.model) on each LLM span.",
    unit: "LLM spans",
    table: {
      view: "spans",
      filters: [LLM_SPANS, { column: "model", operator: Operator.Is, value: "empty", dataType: "string" }],
    },
  },
  {
    id: "llm-missing-usage",
    name: "LLM token usage",
    category: "cost",
    title: "LLM spans are missing token usage",
    impact: "Token counts are missing from usage reports.",
    fix: "Set gen_ai.usage.input_tokens and gen_ai.usage.output_tokens on each LLM span. For streaming calls, request usage in the final chunk.",
    unit: "LLM spans",
    table: {
      view: "spans",
      filters: [LLM_SPANS, { column: "total_tokens", operator: Operator.Eq, value: 0, dataType: "number" }],
    },
  },
  {
    id: "llm-missing-cost",
    name: "LLM cost",
    category: "cost",
    title: "LLM spans have tokens but no cost",
    impact: "Spend totals for traces and projects are incomplete.",
    fix: "Add a custom price under Settings > Model costs. Provider must match gen_ai.system and Model must match the span's model name exactly (a date suffix counts), with prices in dollars per million tokens. Prices apply to spans ingested after you save them. Alternatively, send the cost on the span as gen_ai.usage.input_cost / output_cost / cost.",
    link: { label: "Open model costs", path: "settings?tab=model-costs" },
    docsUrl: "https://laminar.sh/docs/platform/custom-model-costs",
    unit: "LLM spans with tokens",
    table: {
      view: "spans",
      filters: [
        LLM_SPANS,
        { column: "total_tokens", operator: Operator.Gt, value: 0, dataType: "number" },
        { column: "total_cost", operator: Operator.Eq, value: 0, dataType: "number" },
      ],
    },
  },
  {
    id: "traces-missing-session",
    name: "Session IDs",
    category: "grouping",
    title: "Traces have no session ID",
    impact: "Multi-turn conversations can't be grouped into sessions.",
    fix: "Set a session ID on the trace (Laminar.setTraceSessionId / Laminar.set_trace_session_id, or the lmnr.association.properties.session_id attribute).",
    unit: "traces",
    table: {
      view: "traces",
      filters: [{ column: "session_id", operator: Operator.Is, value: "empty", dataType: "string" }],
    },
  },
];

export interface TraceHealthCheckResult {
  id: TraceHealthCheckId;
  applicable: number;
  failing: number;
  /** Matching span or trace ids (at most `TRACE_HEALTH_MAX_LINKED_IDS`) for checks linked by id. */
  matchIds: string[];
}

export interface TraceHealthResponse {
  /** Number of recent traces the checks ran over (at most `TRACE_HEALTH_SAMPLE_SIZE`). */
  traceCount: number;
  /** ISO start of the oldest checked trace, so table links cover every checked trace. */
  oldestStart: string | null;
  results: TraceHealthCheckResult[];
}

/** Checks run over the project's most recent traces. */
export const TRACE_HEALTH_SAMPLE_SIZE = 100;

/** Each id becomes one `filter` URL param (~140 chars), so this keeps links well under URL size limits. */
export const TRACE_HEALTH_MAX_LINKED_IDS = 50;

export const isBlockingFailure = (result: TraceHealthCheckResult) => {
  const check = TRACE_HEALTH_CHECKS.find((c) => c.id === result.id);
  return result.failing > 0 && !!check && !TRACE_HEALTH_CATEGORIES[check.category].advisory;
};
