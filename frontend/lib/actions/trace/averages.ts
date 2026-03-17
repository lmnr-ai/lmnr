import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export const GetTraceAveragesSchema = z.object({
  projectId: z.string(),
});

export type TraceAverageStats = {
  avgCost: number;
};

export async function getTraceAverages(input: z.infer<typeof GetTraceAveragesSchema>): Promise<TraceAverageStats> {
  const { projectId } = GetTraceAveragesSchema.parse(input);

  const results = await executeQuery<{ avgCost: number }>({
    query: `
      SELECT avg(total_cost) as avgCost
      FROM traces
      WHERE start_time >= now() - INTERVAL 3 DAY
        AND trace_type = 'DEFAULT'
    `,
    projectId,
  });

  return {
    avgCost: Number(results[0]?.avgCost ?? 0),
  };
}
