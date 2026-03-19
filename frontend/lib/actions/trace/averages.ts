import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export const GetAverageCostSchema = z.object({
  projectId: z.string(),
});

export type AverageCostStats = {
  avgCost: number;
};

export async function getTraceAverages(input: z.infer<typeof GetAverageCostSchema>): Promise<AverageCostStats> {
  const { projectId } = GetAverageCostSchema.parse(input);

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

export async function getSpanAverages(input: z.infer<typeof GetAverageCostSchema>): Promise<AverageCostStats> {
  const { projectId } = GetAverageCostSchema.parse(input);

  const results = await executeQuery<{ avgCost: number }>({
    query: `
      SELECT avg(total_cost) as avgCost
      FROM spans
      WHERE start_time >= now() - INTERVAL 3 DAY
        AND span_type = 'LLM'
    `,
    projectId,
  });

  return {
    avgCost: Number(results[0]?.avgCost ?? 0),
  };
}
