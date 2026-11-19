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
  LLM_NO_COST,
  LLM_NO_MODEL,
  LLM_NO_USAGE,
  RAW_LLM_NO_INPUT,
  RAW_LLM_NO_OUTPUT,
  RAW_TOOL_NO_OUTPUT,
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

// Per-trace counts first, so the root-span check (a per-trace property) shares the scan with the span checks.
// A trace's spans never start before the trace, so the oldest trace start bounds the span scan.
const SPAN_CHECKS_QUERY = `
  SELECT
    sum(n_llm) AS llmSpans,
    sum(n_tool) AS toolSpans,
    sum(n_llm_with_tokens) AS llmSpansWithTokens,
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
      countIf(${LLM_NO_MODEL}) AS n_llm_no_model,
      countIf(${LLM_NO_USAGE}) AS n_llm_no_usage,
      countIf(${LLM_NO_COST}) AS n_llm_no_cost,
      countIf(${IS_ROOT}) AS n_roots
    FROM spans
    WHERE trace_id IN ({traceIds: Array(UUID)}) AND start_time >= {oldestStart: String}
    GROUP BY trace_id
  )
`;

// Raw `spans`, not the query engine's view: see RAW_LLM_NO_INPUT. Bypassing the engine means scoping
// to the project here; the trace ids come from the engine-scoped lookup above.
const IO_CHECKS_QUERY = `
  SELECT
    countIf(${RAW_LLM_NO_INPUT}) AS llmNoInput,
    groupArrayIf(${MAX_IDS})(span_id, ${RAW_LLM_NO_INPUT}) AS llmNoInputIds,
    countIf(${RAW_LLM_NO_OUTPUT}) AS llmNoOutput,
    groupArrayIf(${MAX_IDS})(span_id, ${RAW_LLM_NO_OUTPUT}) AS llmNoOutputIds,
    countIf(${RAW_TOOL_NO_OUTPUT}) AS toolNoOutput,
    groupArrayIf(${MAX_IDS})(span_id, ${RAW_TOOL_NO_OUTPUT}) AS toolNoOutputIds
  FROM spans
  WHERE project_id = {projectId: UUID}
    AND trace_id IN ({traceIds: Array(UUID)})
    AND start_time >= {oldestStart: DateTime64(9, 'UTC')}
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
  llmNoModel: Num;
  llmNoUsage: Num;
  llmNoCost: Num;
  traces: Num;
  multiRoot: Num;
  multiRootIds: string[];
}

interface IoChecksRow {
  llmNoInput: Num;
  llmNoInputIds: string[];
  llmNoOutput: Num;
  llmNoOutputIds: string[];
  toolNoOutput: Num;
  toolNoOutputIds: string[];
}

const result = (
  id: TraceHealthCheckId,
  applicable: Num,
  failing: Num,
  matchIds: string[] = []
): TraceHealthCheckResult => ({ id, applicable: Number(applicable), failing: Number(failing), matchIds });

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

const getIoChecks = async (projectId: string, traceIds: string[], oldestStart: string) => {
  const result = await clickhouseClient.query({
    query: IO_CHECKS_QUERY,
    format: "JSONEachRow",
    query_params: { projectId, traceIds, oldestStart },
  });
  const [row] = await result.json<IoChecksRow>();
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

  const [[s], io] = await Promise.all([
    executeQuery<SpanChecksRow>({ query: SPAN_CHECKS_QUERY, parameters: { traceIds, oldestStart }, projectId }),
    getIoChecks(projectId, traceIds, oldestStart),
  ]);
  if (s) {
    results.push(
      result("llm-missing-model", s.llmSpans, s.llmNoModel),
      result("llm-missing-usage", s.llmSpans, s.llmNoUsage),
      result("llm-missing-cost", s.llmSpansWithTokens, s.llmNoCost),
      result("multiple-root-spans", s.traces, s.multiRoot, s.multiRootIds)
    );
    if (io) {
      results.push(
        result("llm-missing-input", s.llmSpans, io.llmNoInput, io.llmNoInputIds),
        result("llm-missing-output", s.llmSpans, io.llmNoOutput, io.llmNoOutputIds),
        result("tool-missing-output", s.toolSpans, io.toolNoOutput, io.toolNoOutputIds)
      );
    }
  }

  return { traceCount: traces.length, oldestStart: toIso(oldestStart), results };
}
