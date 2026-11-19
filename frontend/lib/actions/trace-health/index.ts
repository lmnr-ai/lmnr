import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import {
  TRACE_HEALTH_MAX_LINKED_IDS,
  TRACE_HEALTH_SAMPLE_SIZE,
  type TraceHealthCheckId,
  type TraceHealthCheckResult,
  type TraceHealthResponse,
} from "@/lib/trace-health/checks";
import {
  IS_ROOT,
  RAW_LLM,
  RAW_LLM_NO_COST,
  RAW_LLM_NO_INPUT,
  RAW_LLM_NO_MODEL,
  RAW_LLM_NO_OUTPUT,
  RAW_LLM_NO_USAGE,
  RAW_LLM_OK,
  RAW_TOOL_NO_OUTPUT,
  RAW_TOOL_OK,
} from "@/lib/trace-health/sql";

export const GetTraceHealthSchema = z.object({ projectId: z.guid() });

// Sorting a busy project's whole trace history exceeds the query memory limit, so look back over
// growing windows and stop at the first one holding a full sample. Quiet projects reach the
// unbounded lookup, which is cheap for them.
const LOOKBACK_DAYS = [1, 7, 30, null] as const;

const recentTracesQuery = (days: number | null) => `
  SELECT id, start_time AS startTime, session_id = '' AS noSession
  FROM traces
  WHERE trace_type = 'DEFAULT'${days === null ? "" : ` AND start_time > now() - INTERVAL ${days} DAY`}
  ORDER BY start_time DESC
  LIMIT ${TRACE_HEALTH_SAMPLE_SIZE}
`;

const MAX_IDS = TRACE_HEALTH_MAX_LINKED_IDS;

// Raw `spans`, not the query engine's view: see RAW_LLM_NO_INPUT. Bypassing the engine means scoping
// to the project here; the trace ids come from the engine-scoped lookup above.
// Per-trace counts first, so the root-span check (a per-trace property) shares the scan with the span checks.
// A trace's spans never start before the trace, so the oldest trace start bounds the scan.
const SPAN_CHECKS_QUERY = `
  SELECT
    sum(n_llm) AS llmSpans,
    sum(n_llm_ok) AS llmOkSpans,
    sum(n_tool_ok) AS toolOkSpans,
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
      countIf(${RAW_LLM}) AS n_llm,
      countIf(${RAW_LLM_OK}) AS n_llm_ok,
      countIf(${RAW_TOOL_OK}) AS n_tool_ok,
      countIf(${RAW_LLM} AND total_tokens > 0) AS n_llm_with_tokens,
      countIf(${RAW_LLM_NO_INPUT}) AS n_llm_no_input,
      groupArrayIf(${MAX_IDS})((span_id, trace_id), ${RAW_LLM_NO_INPUT}) AS ids_llm_no_input,
      countIf(${RAW_LLM_NO_OUTPUT}) AS n_llm_no_output,
      groupArrayIf(${MAX_IDS})((span_id, trace_id), ${RAW_LLM_NO_OUTPUT}) AS ids_llm_no_output,
      countIf(${RAW_TOOL_NO_OUTPUT}) AS n_tool_no_output,
      groupArrayIf(${MAX_IDS})((span_id, trace_id), ${RAW_TOOL_NO_OUTPUT}) AS ids_tool_no_output,
      countIf(${RAW_LLM_NO_MODEL}) AS n_llm_no_model,
      countIf(${RAW_LLM_NO_USAGE}) AS n_llm_no_usage,
      countIf(${RAW_LLM_NO_COST}) AS n_llm_no_cost,
      countIf(${IS_ROOT}) AS n_roots
    FROM spans
    WHERE project_id = {projectId: UUID}
      AND trace_id IN ({traceIds: Array(UUID)})
      AND start_time >= {oldestStart: DateTime64(9, 'UTC')}
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
  llmOkSpans: Num;
  toolOkSpans: Num;
  llmSpansWithTokens: Num;
  llmNoInput: Num;
  llmNoInputIds: [string, string][];
  llmNoOutput: Num;
  llmNoOutputIds: [string, string][];
  toolNoOutput: Num;
  toolNoOutputIds: [string, string][];
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
  matchIds: string[] = [],
  matchTraceIds: string[] = []
): TraceHealthCheckResult => ({
  id,
  applicable: Number(applicable),
  failing: Number(failing),
  matchIds,
  matchTraceIds,
});

/** (span_id, trace_id) pairs → the span ids plus their distinct trace ids. */
const spanResult = (id: TraceHealthCheckId, applicable: Num, failing: Num, pairs: [string, string][]) =>
  result(
    id,
    applicable,
    failing,
    pairs.map(([spanId]) => spanId),
    [...new Set(pairs.map(([, traceId]) => traceId))]
  );

/** ClickHouse `YYYY-MM-DD hh:mm:ss.nnnnnnnnn` (UTC) → ISO, for the table's `startDate` URL param. */
const toIso = (chTime: string) => new Date(`${chTime.replace(" ", "T").slice(0, 23)}Z`).toISOString();

const getRecentTraces = async (projectId: string) => {
  let traces: RecentTraceRow[] = [];
  for (const days of LOOKBACK_DAYS) {
    try {
      traces = await executeQuery<RecentTraceRow>({ query: recentTracesQuery(days), projectId });
    } catch (error) {
      // A wider window can exceed the memory limit; a smaller sample is still a useful answer.
      if (traces.length > 0) return traces;
      throw error;
    }
    if (traces.length >= TRACE_HEALTH_SAMPLE_SIZE) break;
  }
  return traces;
};

const getSpanChecks = async (projectId: string, traceIds: string[], oldestStart: string) => {
  const result = await clickhouseClient.query({
    query: SPAN_CHECKS_QUERY,
    format: "JSONEachRow",
    query_params: { projectId, traceIds, oldestStart },
    // Reads `length(input)` from the column's size subcolumn, so only the empty-value match touches
    // payloads. Prod pins `compatibility = 24.6`, which turns this off.
    clickhouse_settings: { optimize_functions_to_subcolumns: 1 },
  });
  const [row] = await result.json<SpanChecksRow>();
  return row;
};

/** Runs every trace health check over the project's most recent traces. */
export async function getTraceHealth(input: z.infer<typeof GetTraceHealthSchema>): Promise<TraceHealthResponse> {
  const { projectId } = GetTraceHealthSchema.parse(input);

  const traces = await getRecentTraces(projectId);
  if (traces.length === 0) return { traceCount: 0, oldestStart: null, results: [] };

  const oldestStart = traces.reduce((min, t) => (t.startTime < min ? t.startTime : min), traces[0].startTime);
  const noSession = traces.filter((t) => Number(t.noSession) > 0);
  const results = [result("traces-missing-session", traces.length, noSession.length)];
  const traceIds = traces.map((t) => t.id);

  const s = await getSpanChecks(projectId, traceIds, oldestStart);
  if (s) {
    results.push(
      spanResult("llm-missing-input", s.llmOkSpans, s.llmNoInput, s.llmNoInputIds),
      spanResult("llm-missing-output", s.llmOkSpans, s.llmNoOutput, s.llmNoOutputIds),
      spanResult("tool-missing-output", s.toolOkSpans, s.toolNoOutput, s.toolNoOutputIds),
      result("llm-missing-model", s.llmSpans, s.llmNoModel),
      result("llm-missing-usage", s.llmOkSpans, s.llmNoUsage),
      result("llm-missing-cost", s.llmSpansWithTokens, s.llmNoCost),
      result("multiple-root-spans", s.traces, s.multiRoot, s.multiRootIds)
    );
  }

  return { traceCount: traces.length, oldestStart: toIso(oldestStart), results };
}
