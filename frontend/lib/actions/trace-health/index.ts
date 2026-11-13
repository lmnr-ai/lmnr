import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import {
  TRACE_HEALTH_MAX_LINKED_IDS,
  TRACE_HEALTH_SAMPLE_SIZE,
  type TraceHealthCheckId,
  type TraceHealthCheckResult,
  type TraceHealthResponse,
} from "@/lib/trace-health/checks";
import {
  IS_ROOT,
  LLM_NO_COST,
  LLM_NO_INPUT,
  LLM_NO_MODEL,
  LLM_NO_OUTPUT,
  LLM_NO_USAGE,
  TOOL_NO_OUTPUT,
} from "@/lib/trace-health/sql";

export const GetTraceHealthSchema = z.object({ projectId: z.guid() });

const RECENT_TRACES_QUERY = `
  SELECT id, start_time AS startTime, session_id = '' AS noSession
  FROM traces
  WHERE trace_type = 'DEFAULT'
  ORDER BY start_time DESC
  LIMIT ${TRACE_HEALTH_SAMPLE_SIZE}
`;

const MAX_IDS = TRACE_HEALTH_MAX_LINKED_IDS;

// Per-trace counts first, so the root-span check (a per-trace property) shares the scan with the span checks.
// Checks with no table filter equivalent also collect the matching span ids, so the dialog can link to them.
// A trace's spans never start before the trace, so the oldest trace start bounds the span scan.
const SPAN_CHECKS_QUERY = `
  SELECT
    sum(n_llm) AS llmSpans,
    sum(n_tool) AS toolSpans,
    sum(n_llm_with_tokens) AS llmSpansWithTokens,
    sum(n_llm_no_input) AS llmNoInput,
    arraySlice(groupArrayArray(ids_llm_no_input), 1, ${MAX_IDS}) AS llmNoInputIds,
    sum(n_llm_no_output) AS llmNoOutput,
    arraySlice(groupArrayArray(ids_llm_no_output), 1, ${MAX_IDS}) AS llmNoOutputIds,
    sum(n_tool_no_output) AS toolNoOutput,
    arraySlice(groupArrayArray(ids_tool_no_output), 1, ${MAX_IDS}) AS toolNoOutputIds,
    sum(n_llm_no_model) AS llmNoModel,
    sum(n_llm_no_usage) AS llmNoUsage,
    sum(n_llm_no_cost) AS llmNoCost,
    count() AS traces,
    countIf(n_roots > 1) AS multiRoot,
    groupArrayIf(${MAX_IDS})(trace_id, n_roots > 1) AS multiRootIds
  FROM (
    SELECT
      trace_id,
      countIf(span_type = 'LLM') AS n_llm,
      countIf(span_type = 'TOOL') AS n_tool,
      countIf(span_type = 'LLM' AND total_tokens > 0) AS n_llm_with_tokens,
      countIf(${LLM_NO_INPUT}) AS n_llm_no_input,
      groupArrayIf(span_id, ${LLM_NO_INPUT}) AS ids_llm_no_input,
      countIf(${LLM_NO_OUTPUT}) AS n_llm_no_output,
      groupArrayIf(span_id, ${LLM_NO_OUTPUT}) AS ids_llm_no_output,
      countIf(${TOOL_NO_OUTPUT}) AS n_tool_no_output,
      groupArrayIf(span_id, ${TOOL_NO_OUTPUT}) AS ids_tool_no_output,
      countIf(${LLM_NO_MODEL}) AS n_llm_no_model,
      countIf(${LLM_NO_USAGE}) AS n_llm_no_usage,
      countIf(${LLM_NO_COST}) AS n_llm_no_cost,
      countIf(${IS_ROOT}) AS n_roots
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
  llmNoInputIds: string[];
  llmNoOutput: Num;
  llmNoOutputIds: string[];
  toolNoOutput: Num;
  toolNoOutputIds: string[];
  llmNoModel: Num;
  llmNoUsage: Num;
  llmNoCost: Num;
  traces: Num;
  multiRoot: Num;
  multiRootIds: string[];
}

const result = (
  id: TraceHealthCheckId,
  applicable: Num,
  failing: Num,
  matchIds: string[] = []
): TraceHealthCheckResult => ({ id, applicable: Number(applicable), failing: Number(failing), matchIds });

/** ClickHouse `YYYY-MM-DD hh:mm:ss.nnnnnnnnn` (UTC) → ISO, for the table's `startDate` URL param. */
const toIso = (chTime: string) => new Date(`${chTime.replace(" ", "T").slice(0, 23)}Z`).toISOString();

/** Runs every trace health check over the project's most recent traces. */
export async function getTraceHealth(input: z.infer<typeof GetTraceHealthSchema>): Promise<TraceHealthResponse> {
  const { projectId } = GetTraceHealthSchema.parse(input);

  const traces = await executeQuery<RecentTraceRow>({ query: RECENT_TRACES_QUERY, projectId });
  if (traces.length === 0) return { traceCount: 0, oldestStart: null, results: [] };

  const oldestStart = traces.reduce((min, t) => (t.startTime < min ? t.startTime : min), traces[0].startTime);
  const noSession = traces.filter((t) => Number(t.noSession) > 0);
  const results = [result("traces-missing-session", traces.length, noSession.length)];

  const [s] = await executeQuery<SpanChecksRow>({
    query: SPAN_CHECKS_QUERY,
    parameters: { traceIds: traces.map((t) => t.id), oldestStart },
    projectId,
  });
  if (s) {
    results.push(
      result("llm-missing-input", s.llmSpans, s.llmNoInput, s.llmNoInputIds),
      result("llm-missing-output", s.llmSpans, s.llmNoOutput, s.llmNoOutputIds),
      result("tool-missing-output", s.toolSpans, s.toolNoOutput, s.toolNoOutputIds),
      result("llm-missing-model", s.llmSpans, s.llmNoModel),
      result("llm-missing-usage", s.llmSpans, s.llmNoUsage),
      result("llm-missing-cost", s.llmSpansWithTokens, s.llmNoCost),
      result("multiple-root-spans", s.traces, s.multiRoot, s.multiRootIds)
    );
  }

  return { traceCount: traces.length, oldestStart: toIso(oldestStart), results };
}
