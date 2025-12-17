import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";

export const GetSpanOutputsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.string(),
  traceId: z.string(),
  spanIds: z.array(z.string()).min(1),
});

export async function getSpanOutputs(input: z.infer<typeof GetSpanOutputsSchema>): Promise<Record<string, any>> {
  const { projectId, spanIds } = input;

  if (spanIds.length === 0) {
    return {};
  }

  try {
    const results = await executeQuery<{ spanId: string; output: string }>({
      projectId,
      query: `
        SELECT
          span_id as spanId,
          output
        FROM spans
        WHERE span_id IN {spanIds: Array(UUID)}
      `,
      parameters: {
        projectId,
        spanIds,
      },
    });

    const outputsMap: Record<string, any> = {};

    for (const result of results) {
      outputsMap[result.spanId] = tryParseJson(result.output);
    }

    for (const spanId of spanIds) {
      if (!(spanId in outputsMap)) {
        outputsMap[spanId] = null;
      }
    }

    return outputsMap;
  } catch (error) {
    console.error("Error fetching span outputs:", error);
    throw new Error("Failed to fetch span outputs");
  }
}
