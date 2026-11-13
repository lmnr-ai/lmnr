import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export interface TraceSpanCounts {
  llm: number;
  tool: number;
  errors: number;
}

const countsSchema = z.object({ traceIds: z.array(z.guid()).min(1).max(100) });

// Errors propagate to ancestors, so only errored spans with no errored child (the originating ones) count.
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
