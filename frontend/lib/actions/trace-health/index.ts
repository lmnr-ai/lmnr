import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import {
  TRACE_HEALTH_SAMPLE_SIZE,
  type TraceHealthCheckId,
  type TraceHealthCheckResult,
  type TraceHealthResponse,
} from "@/lib/trace-health/checks";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const GetTraceHealthSchema = z.object({ projectId: z.guid() });

// Payloads of 4 chars or fewer are empty in practice: '', 'null', '[]', '{}', '""'.
const LLM_NO_INPUT = "span_type = 'LLM' AND length(input) <= 4";
const LLM_NO_OUTPUT = "span_type = 'LLM' AND length(output) <= 4";
const TOOL_NO_OUTPUT = "span_type = 'TOOL' AND length(output) <= 4";
const LLM_NO_MODEL = "span_type = 'LLM' AND model = ''";
const LLM_NO_USAGE = "span_type = 'LLM' AND total_tokens = 0";
const LLM_NO_COST = "span_type = 'LLM' AND total_tokens > 0 AND total_cost = 0";

const RECENT_TRACES_QUERY = `
  SELECT id, start_time AS startTime, session_id = '' AS noSession
  FROM traces
  WHERE trace_type = 'DEFAULT'
  ORDER BY start_time DESC
  LIMIT ${TRACE_HEALTH_SAMPLE_SIZE}
`;

// Per-trace counts first, so the root-span check (a per-trace property) shares the scan with the span checks.
// A trace's spans never start before the trace, so the oldest trace start bounds the span scan.
const SPAN_CHECKS_QUERY = `
  SELECT
    sum(n_llm) AS llmSpans,
    sum(n_tool) AS toolSpans,
    sum(n_llm_with_tokens) AS llmSpansWithTokens,
    sum(n_llm_no_input) AS llmNoInput,
    anyIf(trace_id, n_llm_no_input > 0) AS llmNoInputSample,
    sum(n_llm_no_output) AS llmNoOutput,
    anyIf(trace_id, n_llm_no_output > 0) AS llmNoOutputSample,
    sum(n_tool_no_output) AS toolNoOutput,
    anyIf(trace_id, n_tool_no_output > 0) AS toolNoOutputSample,
    sum(n_llm_no_model) AS llmNoModel,
    anyIf(trace_id, n_llm_no_model > 0) AS llmNoModelSample,
    sum(n_llm_no_usage) AS llmNoUsage,
    anyIf(trace_id, n_llm_no_usage > 0) AS llmNoUsageSample,
    sum(n_llm_no_cost) AS llmNoCost,
    anyIf(trace_id, n_llm_no_cost > 0) AS llmNoCostSample,
    count() AS traces,
    countIf(n_roots > 1) AS multiRoot,
    anyIf(trace_id, n_roots > 1) AS multiRootSample
  FROM (
    SELECT
      trace_id,
      countIf(span_type = 'LLM') AS n_llm,
      countIf(span_type = 'TOOL') AS n_tool,
      countIf(span_type = 'LLM' AND total_tokens > 0) AS n_llm_with_tokens,
      countIf(${LLM_NO_INPUT}) AS n_llm_no_input,
      countIf(${LLM_NO_OUTPUT}) AS n_llm_no_output,
      countIf(${TOOL_NO_OUTPUT}) AS n_tool_no_output,
      countIf(${LLM_NO_MODEL}) AS n_llm_no_model,
      countIf(${LLM_NO_USAGE}) AS n_llm_no_usage,
      countIf(${LLM_NO_COST}) AS n_llm_no_cost,
      countIf(parent_span_id = toUUID('${NIL_UUID}')) AS n_roots
    FROM spans
    WHERE trace_id IN ({traceIds: Array(UUID)}) AND start_time >= {oldestStart: String}
    GROUP BY trace_id
  )
`;

type Num = number | string;

interface RecentTraceRow {
  id: string;
  startTime: string;
  noSession: Num;
}

interface SpanChecksRow {
  llmSpans: Num;
  toolSpans: Num;
  llmSpansWithTokens: Num;
  llmNoInput: Num;
  llmNoInputSample: string;
  llmNoOutput: Num;
  llmNoOutputSample: string;
  toolNoOutput: Num;
  toolNoOutputSample: string;
  llmNoModel: Num;
  llmNoModelSample: string;
  llmNoUsage: Num;
  llmNoUsageSample: string;
  llmNoCost: Num;
  llmNoCostSample: string;
  traces: Num;
  multiRoot: Num;
  multiRootSample: string;
}

const result = (id: TraceHealthCheckId, applicable: Num, failing: Num, sample: string): TraceHealthCheckResult => {
  const failingCount = Number(failing);
  return {
    id,
    applicable: Number(applicable),
    failing: failingCount,
    sampleTraceId: failingCount > 0 && sample && sample !== NIL_UUID ? sample : null,
  };
};

/** Runs every trace health check over the project's most recent traces. */
export async function getTraceHealth(input: z.infer<typeof GetTraceHealthSchema>): Promise<TraceHealthResponse> {
  const { projectId } = GetTraceHealthSchema.parse(input);

  const traces = await executeQuery<RecentTraceRow>({ query: RECENT_TRACES_QUERY, projectId });
  if (traces.length === 0) return { traceCount: 0, results: [] };

  const noSession = traces.filter((t) => Number(t.noSession) > 0);
  const results = [result("traces-missing-session", traces.length, noSession.length, noSession[0]?.id ?? "")];

  const [s] = await executeQuery<SpanChecksRow>({
    query: SPAN_CHECKS_QUERY,
    parameters: {
      traceIds: traces.map((t) => t.id),
      oldestStart: traces.reduce((min, t) => (t.startTime < min ? t.startTime : min), traces[0].startTime),
    },
    projectId,
  });
  if (s) {
    results.push(
      result("llm-missing-input", s.llmSpans, s.llmNoInput, s.llmNoInputSample),
      result("llm-missing-output", s.llmSpans, s.llmNoOutput, s.llmNoOutputSample),
      result("tool-missing-output", s.toolSpans, s.toolNoOutput, s.toolNoOutputSample),
      result("llm-missing-model", s.llmSpans, s.llmNoModel, s.llmNoModelSample),
      result("llm-missing-usage", s.llmSpans, s.llmNoUsage, s.llmNoUsageSample),
      result("llm-missing-cost", s.llmSpansWithTokens, s.llmNoCost, s.llmNoCostSample),
      result("multiple-root-spans", s.traces, s.multiRoot, s.multiRootSample)
    );
  }

  return { traceCount: traces.length, results };
}
