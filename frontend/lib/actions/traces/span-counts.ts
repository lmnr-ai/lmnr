import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export interface TraceSpanCounts {
  llm: number;
  tool: number;
  errors: number;
}

export interface ModelTokens {
  model: string;
  tokens: number;
}

const countsSchema = z.object({ traceIds: z.array(z.guid()).min(1).max(100) });
// A session's full trace list; trace_id is the spans primary-key prefix, so this stays a keyed read.
const modelsSchema = z.object({ traceIds: z.array(z.guid()).min(1).max(5000) });

// Errors propagate to ancestors, so only errored spans whose parent isn't errored count.
const COUNTS_QUERY = `
  SELECT
    trace_id AS traceId,
    countIf(span_type = 'LLM') AS llm,
    countIf(span_type = 'TOOL') AS tool,
    groupArrayIf(span_id, status = 'error') AS errorIds,
    groupArrayIf(parent_span_id, status = 'error') AS errorParents
  FROM spans
  WHERE trace_id IN ({traceIds: Array(UUID)})
  GROUP BY trace_id
`;

const MODELS_QUERY = `
  SELECT model, sum(total_tokens) AS tokens
  FROM spans
  WHERE trace_id IN ({traceIds: Array(UUID)})
    AND span_type = 'LLM'
    AND model != ''
  GROUP BY model
  ORDER BY tokens DESC
`;

/** LLM / tool / originating-error counts per trace, without loading any span rows. */
export async function getTraceSpanCounts({
  traceIds,
  projectId,
}: {
  traceIds: string[];
  projectId: string;
}): Promise<Record<string, TraceSpanCounts>> {
  const parsed = countsSchema.parse({ traceIds });
  const rows = await executeQuery<{
    traceId: string;
    llm: number | string;
    tool: number | string;
    errorIds: string[];
    errorParents: string[];
  }>({ query: COUNTS_QUERY, parameters: { traceIds: parsed.traceIds }, projectId });

  const result: Record<string, TraceSpanCounts> = {};
  for (const id of parsed.traceIds) result[id] = { llm: 0, tool: 0, errors: 0 };
  for (const row of rows) {
    const erroredParents = new Set(row.errorParents);
    result[row.traceId] = {
      llm: Number(row.llm),
      tool: Number(row.tool),
      errors: row.errorIds.filter((id) => !erroredParents.has(id)).length,
    };
  }
  return result;
}

/** Total tokens per model across a set of traces (a session). */
export async function getModelTokens({
  traceIds,
  projectId,
}: {
  traceIds: string[];
  projectId: string;
}): Promise<ModelTokens[]> {
  const parsed = modelsSchema.parse({ traceIds });
  const rows = await executeQuery<{ model: string; tokens: number | string }>({
    query: MODELS_QUERY,
    parameters: { traceIds: parsed.traceIds },
    projectId,
  });
  return rows.map((r) => ({ model: r.model, tokens: Number(r.tokens) }));
}
