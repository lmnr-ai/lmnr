export type TraceHealthCategory = "evals" | "cost" | "grouping";

export type TraceHealthCheckId =
  | "llm-missing-input"
  | "llm-missing-output"
  | "tool-missing-output"
  | "multiple-root-spans"
  | "llm-missing-model"
  | "llm-missing-usage"
  | "llm-missing-cost"
  | "traces-missing-session";

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
}

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
    impact: "Evals and signals can't see what the model was asked.",
    fix: "Record the request messages on each LLM span (gen_ai.input.messages, or lmnr.span.input via the Laminar SDK).",
    unit: "LLM spans",
  },
  {
    id: "llm-missing-output",
    name: "LLM span output",
    category: "evals",
    title: "LLM spans are missing output",
    impact: "Evals and signals can't see what the model answered.",
    fix: "Record the response messages on each LLM span (gen_ai.output.messages, or lmnr.span.output via the Laminar SDK).",
    unit: "LLM spans",
  },
  {
    id: "tool-missing-output",
    name: "Tool span output",
    category: "evals",
    title: "Tool spans are missing output",
    impact: "Evals and signals can't see what a tool call returned.",
    fix: "Record the tool result on each tool span (gen_ai.tool.call.result, or wrap the tool with Laminar's observe so its return value is captured).",
    unit: "tool spans",
  },
  {
    id: "multiple-root-spans",
    name: "Single root span per trace",
    category: "evals",
    title: "Traces have multiple root spans",
    impact: "Trace context isn't propagated, so one run is split into disconnected pieces.",
    fix: "Propagate the active span context across async boundaries, threads and service calls so child spans attach to their parent.",
    unit: "traces",
  },
  {
    id: "llm-missing-model",
    name: "LLM span model",
    category: "cost",
    title: "LLM spans are missing the model",
    impact: "Costs can't be computed and spans can't be filtered by model.",
    fix: "Set gen_ai.request.model (or gen_ai.response.model) on each LLM span.",
    unit: "LLM spans",
  },
  {
    id: "llm-missing-usage",
    name: "LLM token usage",
    category: "cost",
    title: "LLM spans are missing token usage",
    impact: "Token counts are missing from usage reports.",
    fix: "Set gen_ai.usage.input_tokens and gen_ai.usage.output_tokens on each LLM span. For streaming calls, request usage in the final chunk.",
    unit: "LLM spans",
  },
  {
    id: "llm-missing-cost",
    name: "LLM cost",
    category: "cost",
    title: "LLM spans have tokens but no cost",
    impact: "Spend totals for traces and projects are incomplete.",
    fix: "Send gen_ai.system / gen_ai.provider.name and a model name Laminar can price, or send the cost directly as gen_ai.usage.cost.",
    unit: "LLM spans with tokens",
  },
  {
    id: "traces-missing-session",
    name: "Session IDs",
    category: "grouping",
    title: "Traces have no session ID",
    impact: "Multi-turn conversations can't be grouped into sessions.",
    fix: "Set a session ID on the trace (Laminar.setTraceSessionId / Laminar.set_trace_session_id, or the lmnr.association.properties.session_id attribute).",
    unit: "traces",
  },
];

export interface TraceHealthCheckResult {
  id: TraceHealthCheckId;
  applicable: number;
  failing: number;
  sampleTraceId: string | null;
}

export interface TraceHealthResponse {
  results: TraceHealthCheckResult[];
}

/** Same shape as the `DateRangeFilter` value: either `pastHours` or an absolute `startDate`/`endDate`. */
export interface TraceHealthTimeRange {
  pastHours?: string;
  startDate?: string;
  endDate?: string;
}

/** The button always looks at the past day, independent of the dialog's picker. */
export const DEFAULT_TRACE_HEALTH_RANGE: TraceHealthTimeRange = { pastHours: "24" };

export const isBlockingFailure = (result: TraceHealthCheckResult) => {
  const check = TRACE_HEALTH_CHECKS.find((c) => c.id === result.id);
  return result.failing > 0 && !!check && !TRACE_HEALTH_CATEGORIES[check.category].advisory;
};
