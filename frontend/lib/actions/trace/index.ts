import { and, eq, inArray, or, sql } from "drizzle-orm";
import { uniq } from "lodash";
import { z } from "zod/v4";

import { transformMessages } from "@/lib/actions/trace/utils";
import { db } from "@/lib/db/drizzle";
import { sharedPayloads, spans, traces } from "@/lib/db/migrations/schema";
import { SpanType } from "@/lib/traces/types";

export const UpdateTraceVisibilitySchema = z.object({
  traceId: z.string(),
  projectId: z.string(),
  visibility: z.enum(["public", "private"]),
});

export async function updateTraceVisibility(params: z.infer<typeof UpdateTraceVisibilitySchema>) {
  const { traceId, projectId, visibility } = UpdateTraceVisibilitySchema.parse(params);

  const traceSpans = await db
    .select({
      spanId: spans.spanId,
      input: spans.input,
      output: spans.output,
    })
    .from(spans)
    .where(
      and(
        eq(spans.traceId, traceId),
        eq(spans.projectId, projectId),
        or(eq(spans.spanType, SpanType.LLM), eq(spans.name, "ai.generateText"), eq(spans.name, "ai.generateObject"))
      )
    );

  /**
   * 1. Parse span image url's, and extract payload id's
   */
  const parseResult = traceSpans.map((span) => {
    const input = transformMessages(span.input, projectId, visibility);
    const output = transformMessages(span.output, projectId, visibility);
    return {
      id: span.spanId,
      input: input.messages,
      output: output.messages,
      payloadIds: uniq([...Array.from(input.payloads), ...Array.from(output.payloads)]),
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
       * 3. Write into spans
       */

      const values = sql.join(
        parseResult.map(
          (item) => sql`(${item.id}::uuid, ${JSON.stringify(item.input)}::jsonb, ${JSON.stringify(item.output)}::jsonb)`
        ),
        sql`, `
      );

      await tx
        .update(spans)
        .set({
          input: sql`update_data.input`,
          output: sql`update_data.output`,
        })
        .from(sql`(VALUES ${values}) AS update_data(span_id, input, output)`)
        .where(and(eq(spans.spanId, sql`update_data.span_id`), eq(spans.projectId, projectId)));

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
