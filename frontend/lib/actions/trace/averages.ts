import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export const GetTraceSpanAveragesSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
});

export type SpanAverageStats = {
  /** Map of span name -> { avgDurationMs, avgCost } over the last 3 days */
  spans: Record<string, { avgDurationMs: number; avgCost: number }>;
  /** Trace-level averages over the last 3 days */
  trace: { avgDurationMs: number; avgCost: number };
};

export async function getTraceSpanAverages(
  input: z.infer<typeof GetTraceSpanAveragesSchema>
): Promise<SpanAverageStats> {
  const { traceId, projectId } = GetTraceSpanAveragesSchema.parse(input);

  const [spanAverages, traceAverages] = await Promise.all([
    executeQuery<{ name: string; avgDurationMs: number; avgCost: number }>({
      query: `
        SELECT
          name,
          avg(date_diff('millisecond', start_time, end_time)) as avgDurationMs,
          avg(total_cost) as avgCost
        FROM spans
        WHERE project_id = {projectId: UUID}
          AND start_time >= now() - INTERVAL 3 DAY
          AND name IN (
            SELECT DISTINCT name
            FROM spans
            WHERE trace_id = {traceId: UUID}
              AND project_id = {projectId: UUID}
          )
        GROUP BY name
      `,
      projectId,
      parameters: { traceId, projectId },
    }),
    executeQuery<{ avgDurationMs: number; avgCost: number }>({
      query: `
        SELECT
          avg(date_diff('millisecond', start_time, end_time)) as avgDurationMs,
          avg(total_cost) as avgCost
        FROM traces
        WHERE project_id = {projectId: UUID}
          AND start_time >= now() - INTERVAL 3 DAY
          AND trace_type = 'DEFAULT'
      `,
      projectId,
      parameters: { projectId },
    }),
  ]);

  const spans: SpanAverageStats["spans"] = {};
  for (const row of spanAverages) {
    spans[row.name] = {
      avgDurationMs: Number(row.avgDurationMs),
      avgCost: Number(row.avgCost),
    };
  }

  return {
    spans,
    trace: {
      avgDurationMs: Number(traceAverages[0]?.avgDurationMs ?? 0),
      avgCost: Number(traceAverages[0]?.avgCost ?? 0),
    },
  };
}
