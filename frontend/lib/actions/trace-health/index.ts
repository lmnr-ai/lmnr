import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import {
  TRACE_HEALTH_RANGES,
  type TraceHealthCheckId,
  type TraceHealthCheckResult,
  type TraceHealthResponse,
} from "@/lib/trace-health/checks";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const ALLOWED_PAST_HOURS: number[] = TRACE_HEALTH_RANGES.map((r) => r.pastHours);

export const GetTraceHealthSchema = z.object({
  projectId: z.guid(),
  pastHours: z.coerce
    .number()
    .int()
    .refine((h) => ALLOWED_PAST_HOURS.includes(h), { error: "Unsupported time range." }),
});

// Payloads of 4 chars or fewer are empty in practice: '', 'null', '[]', '{}', '""'.
const LLM_NO_INPUT = "span_type = 'LLM' AND length(input) <= 4";
const LLM_NO_OUTPUT = "span_type = 'LLM' AND length(output) <= 4";
const TOOL_NO_OUTPUT = "span_type = 'TOOL' AND length(output) <= 4";
const LLM_NO_MODEL = "span_type = 'LLM' AND model = ''";
const LLM_NO_USAGE = "span_type = 'LLM' AND total_tokens = 0";
const LLM_NO_COST = "span_type = 'LLM' AND total_tokens > 0 AND total_cost = 0";

const TIME_BOUND = "start_time >= now() - INTERVAL {pastHours:UInt32} HOUR";

const SPAN_CHECKS_QUERY = `
  SELECT
    countIf(span_type = 'LLM') AS llmSpans,
    countIf(span_type = 'TOOL') AS toolSpans,
    countIf(span_type = 'LLM' AND total_tokens > 0) AS llmSpansWithTokens,
    countIf(${LLM_NO_INPUT}) AS llmNoInput,
    anyIf(trace_id, ${LLM_NO_INPUT}) AS llmNoInputSample,
    countIf(${LLM_NO_OUTPUT}) AS llmNoOutput,
    anyIf(trace_id, ${LLM_NO_OUTPUT}) AS llmNoOutputSample,
    countIf(${TOOL_NO_OUTPUT}) AS toolNoOutput,
    anyIf(trace_id, ${TOOL_NO_OUTPUT}) AS toolNoOutputSample,
    countIf(${LLM_NO_MODEL}) AS llmNoModel,
    anyIf(trace_id, ${LLM_NO_MODEL}) AS llmNoModelSample,
    countIf(${LLM_NO_USAGE}) AS llmNoUsage,
    anyIf(trace_id, ${LLM_NO_USAGE}) AS llmNoUsageSample,
    countIf(${LLM_NO_COST}) AS llmNoCost,
    anyIf(trace_id, ${LLM_NO_COST}) AS llmNoCostSample
  FROM spans
  WHERE ${TIME_BOUND}
`;

// A trace whose context is propagated correctly has exactly one span without a parent.
const ROOT_SPANS_QUERY = `
  SELECT
    count() AS traces,
    countIf(roots > 1) AS failing,
    anyIf(trace_id, roots > 1) AS sample
  FROM (
    SELECT trace_id, countIf(parent_span_id = toUUID('${NIL_UUID}')) AS roots
    FROM spans
    WHERE ${TIME_BOUND}
    GROUP BY trace_id
  )
`;

const SESSION_QUERY = `
  SELECT
    count() AS traces,
    countIf(session_id = '') AS failing,
    anyIf(id, session_id = '') AS sample
  FROM traces
  WHERE ${TIME_BOUND} AND trace_type = 'DEFAULT'
`;

type Num = number | string;

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
}

interface TraceCheckRow {
  traces: Num;
  failing: Num;
  sample: string;
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

/** Runs every trace health check over the project's recent spans and traces. */
export async function getTraceHealth(input: z.infer<typeof GetTraceHealthSchema>): Promise<TraceHealthResponse> {
  const { projectId, pastHours } = GetTraceHealthSchema.parse(input);
  const parameters = { pastHours };

  const [spanRows, rootRows, sessionRows] = await Promise.all([
    executeQuery<SpanChecksRow>({ query: SPAN_CHECKS_QUERY, parameters, projectId }),
    executeQuery<TraceCheckRow>({ query: ROOT_SPANS_QUERY, parameters, projectId }),
    executeQuery<TraceCheckRow>({ query: SESSION_QUERY, parameters, projectId }),
  ]);

  const results: TraceHealthCheckResult[] = [];

  const s = spanRows[0];
  if (s) {
    results.push(
      result("llm-missing-input", s.llmSpans, s.llmNoInput, s.llmNoInputSample),
      result("llm-missing-output", s.llmSpans, s.llmNoOutput, s.llmNoOutputSample),
      result("tool-missing-output", s.toolSpans, s.toolNoOutput, s.toolNoOutputSample),
      result("llm-missing-model", s.llmSpans, s.llmNoModel, s.llmNoModelSample),
      result("llm-missing-usage", s.llmSpans, s.llmNoUsage, s.llmNoUsageSample),
      result("llm-missing-cost", s.llmSpansWithTokens, s.llmNoCost, s.llmNoCostSample)
    );
  }

  const r = rootRows[0];
  if (r) results.push(result("multiple-root-spans", r.traces, r.failing, r.sample));

  const t = sessionRows[0];
  if (t) results.push(result("traces-missing-session", t.traces, t.failing, t.sample));

  return { pastHours, results };
}
