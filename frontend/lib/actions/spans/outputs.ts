import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { deepParseJson, tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";

export const GetSpanOutputsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.string(),
  traceId: z.string(),
  spanIds: z.array(z.string()).min(1),
});

export async function getSpanOutputs(input: z.infer<typeof GetSpanOutputsSchema>): Promise<Record<string, any>> {
  const { projectId, traceId, spanIds, startDate, endDate } = GetSpanOutputsSchema.parse(input);

  const whereConditions = ["trace_id = {traceId: UUID}", "span_id IN {spanIds: Array(UUID)}"];

  if (startDate) {
    whereConditions.push("start_time >= {startDate: String}");
  }

  if (endDate) {
    whereConditions.push("start_time <= {endDate: String}");
  }

  const results = await executeQuery<{ spanId: string; output: string }>({
    projectId,
    query: `
        SELECT
          span_id as spanId,
          output
        FROM spans
        WHERE ${whereConditions.join("\n          AND ")}
      `,
    parameters: {
      traceId,
      projectId,
      spanIds,
      startDate,
      endDate,
    },
  });

  const outputsMap: Record<string, any> = {};

  for (const result of results) {
    outputsMap[result.spanId] = deepParseJson(tryParseJson(result.output));
  }

  return outputsMap;
}



