import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { getSpanPreviews, type SpanPreviewResult } from "@/lib/actions/spans/previews";
import { db } from "@/lib/db/drizzle.ts";
import { sharedTraces } from "@/lib/db/migrations/schema.ts";

export const GetSharedSpanPreviewsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  traceId: z.string(),
  spanIds: z.array(z.string()).min(1),
  spanTypes: z.record(z.string(), z.string()),
});

/**
 * Preview generation for shared traces.
 * Reuses the main getSpanPreviews flow but with skipGeneration,
 * so no LLM calls or DB fingerprint lookups are performed.
 */
export async function getSharedSpanPreviews(
  input: z.infer<typeof GetSharedSpanPreviewsSchema>
): Promise<SpanPreviewResult> {
  const { traceId, spanIds, spanTypes, startDate, endDate } = GetSharedSpanPreviewsSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

  return getSpanPreviews(
    {
      projectId: sharedTrace.projectId,
      traceId,
      spanIds,
      spanTypes,
      startDate,
      endDate,
    },
    { skipGeneration: true }
  );
}
