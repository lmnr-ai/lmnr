import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { deepParseJson, tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle.ts";
import { sharedTraces } from "@/lib/db/migrations/schema.ts";

export const GetSharedSpanOutputsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  traceId: z.string(),
  spanIds: z.array(z.string()).min(1),
});

export async function getSharedSpanOutputs(
  input: z.infer<typeof GetSharedSpanOutputsSchema>
): Promise<Record<string, any>> {
  const { traceId, spanIds, startDate, endDate } = GetSharedSpanOutputsSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

  const whereConditions = ["trace_id = {traceId: UUID}", "span_id IN {spanIds: Array(UUID)}"];

  if (startDate) {
    whereConditions.push("start_time >= {startDate: String}");
  }

  if (endDate) {
    whereConditions.push("start_time <= {endDate: String}");
  }

  const results = await executeQuery<{ spanId: string; output: string }>({
    projectId: sharedTrace.projectId,
    query: `
        SELECT
          span_id as spanId,
          output
        FROM spans
        WHERE ${whereConditions.join("\n          AND ")}
      `,
    parameters: {
      traceId,
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
