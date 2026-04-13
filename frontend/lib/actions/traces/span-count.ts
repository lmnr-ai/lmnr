import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

const bodySchema = z.object({
  traceIds: z.array(z.guid()).min(1).max(100),
});

/**
 * Batch lookup of span counts per trace.
 *
 * Why a dedicated endpoint: the `traces` view exposes `span_names` as a
 * *set-deduplicated* array (via `||` merge on upsert), so `length(span_names)`
 * undercounts repeated span names. Counting directly in the `spans` table is
 * the reliable source of truth.
 *
 * Returns `Record<traceId, number>`. Traces with no spans are omitted from the
 * response (callers should default to 0).
 */
export async function getSpanCountsByTraceId({
  traceIds,
  projectId,
}: {
  traceIds: string[];
  projectId: string;
}): Promise<Record<string, number>> {
  const parsed = bodySchema.parse({ traceIds });

  const rows = await executeQuery<{ traceId: string; spanCount: number | string }>({
    query: `
      SELECT trace_id AS traceId, count(*) AS spanCount
      FROM spans
      WHERE trace_id IN ({traceIds: Array(UUID)})
      GROUP BY trace_id
    `,
    parameters: { traceIds: parsed.traceIds },
    projectId,
  });

  const out: Record<string, number> = {};
  for (const row of rows) {
    // ClickHouse `count()` returns UInt64, which the query engine may ship as
    // a string to avoid JS precision loss. Parse defensively.
    out[row.traceId] = typeof row.spanCount === "string" ? Number(row.spanCount) : row.spanCount;
  }
  return out;
}
