import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export const GetTraceAveragesSchema = z.object({
  projectId: z.string(),
});

export type TraceAverageStats = {
  /** Trace-level averages over the last 3 days */
  avgDurationMs: number;
  avgCost: number;
};

export async function getTraceAverages(input: z.infer<typeof GetTraceAveragesSchema>): Promise<TraceAverageStats> {
  const { projectId } = GetTraceAveragesSchema.parse(input);

  const results = await executeQuery<{ avgDurationMs: number; avgCost: number }>({
    query: `
      SELECT
        avg(date_diff('millisecond', start_time, end_time)) as avgDurationMs,
        avg(total_cost) as avgCost
      FROM traces
      WHERE start_time >= now() - INTERVAL 3 DAY
        AND trace_type = 'DEFAULT'
    `,
    projectId,
  });

  return {
    avgDurationMs: Number(results[0]?.avgDurationMs ?? 0),
    avgCost: Number(results[0]?.avgCost ?? 0),
  };
}
