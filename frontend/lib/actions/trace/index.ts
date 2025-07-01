import { and, eq, inArray } from "drizzle-orm";
import { map, uniq } from "lodash";
import { z } from "zod/v4";

import { transformMessages } from "@/lib/actions/trace/utils";
import { db } from "@/lib/db/drizzle";
import { sharedPayloads, spans, traces } from "@/lib/db/migrations/schema";

export const UpdateTraceVisibilitySchema = z.object({
  traceId: z.string(),
  projectId: z.string(),
  visibility: z.enum(["public", "private"]),
});

type UpdateTraceVisibilityParams = z.infer<typeof UpdateTraceVisibilitySchema>;

/**
 * Update trace visibility and handle image URL transformations using parsing
 */
export async function updateTraceVisibility(params: UpdateTraceVisibilityParams) {
  const { traceId, projectId, visibility } = UpdateTraceVisibilitySchema.parse(params);

  const traceSpans = await db
    .select({
      spanId: spans.spanId,
      input: spans.input,
      output: spans.output,
    })
    .from(spans)
    .where(and(eq(spans.traceId, traceId), eq(spans.projectId, projectId)));

  /**
   * 1. Parse span image url's, and extract payload id's
   */
  const parseResult = traceSpans.map((span) => {
    const transformedInput = transformMessages(span.input, projectId, visibility);
    const transformedOutput = transformMessages(span.output, projectId, visibility);
    return {
      id: span.spanId,
      input: transformedInput.messages,
      output: transformedOutput.messages,
      payloadIds: uniq([...Array.from(transformedInput.payloads), ...Array.from(transformedOutput.payloads)]),
    };
  });

  const payloadIds = parseResult.flatMap((p) => p.payloadIds);

  /**
   * 2. Perform transaction
   */
  return await db.transaction(async (tx) => {
    await tx
      .update(traces)
      .set({ visibility })
      .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)));

    if (parseResult.length > 0) {
      /**
       * 3. Write into spans TODO: optimize as bulk write, rather than sigular updates
       */
      await Promise.all(
        map(parseResult, (data) =>
          tx
            .update(spans)
            .set({
              input: data.input,
              output: data.output,
            })
            .where(and(eq(spans.spanId, data.id), eq(spans.projectId, projectId)))
        )
      );

      /**
       * 4. Update shared payloads table
       */
      if (payloadIds.length > 0) {
        if (visibility === "public") {
          await tx
            .insert(sharedPayloads)
            .values(payloadIds.map((payloadId) => ({ payloadId, projectId })))
            .onConflictDoNothing();
        } else {
          await tx
            .delete(sharedPayloads)
            .where(and(inArray(sharedPayloads.payloadId, payloadIds), eq(sharedPayloads.projectId, projectId)));
        }
      }
    }
  });
}
