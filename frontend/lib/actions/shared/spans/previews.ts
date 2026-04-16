import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { getSpanPreviews, type SpanPreviewsResult } from "@/lib/actions/spans/previews";
import { db } from "@/lib/db/drizzle.ts";
import { sharedTraces } from "@/lib/db/migrations/schema.ts";

export const GetSharedSpanPreviewsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  traceId: z.guid(),
  spanIds: z.array(z.string()).min(1),
  spanTypes: z.record(z.string(), z.string()),
  inputSpanIds: z.array(z.string()).optional(),
  promptHashes: z.record(z.string(), z.string()).optional(),
});

/**
 * Preview generation for shared traces.
 * Reuses the main getSpanPreviews flow but with skipGeneration,
 * so no LLM calls or DB fingerprint lookups are performed.
 */
export async function getSharedSpanPreviews(
  input: z.infer<typeof GetSharedSpanPreviewsSchema>
): Promise<SpanPreviewsResult> {
  const { traceId, spanIds, spanTypes, startDate, endDate, inputSpanIds, promptHashes } =
    GetSharedSpanPreviewsSchema.parse(input);

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
      inputSpanIds,
      promptHashes,
    },
    { skipGeneration: true }
  );
}
