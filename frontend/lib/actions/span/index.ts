import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { spans } from "@/lib/db/migrations/schema";

export const GetSpanSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
});

export const UpdateSpanOutputSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  output: z.any(),
});

export async function getSpan(input: z.infer<typeof GetSpanSchema>) {
  const { spanId, projectId } = GetSpanSchema.parse(input);

  const span = await db.query.spans.findFirst({
    where: and(eq(spans.spanId, spanId), eq(spans.projectId, projectId)),
  });

  if (!span) {
    throw new Error("Span not found");
  }

  return span;
}

export async function updateSpanOutput(input: z.infer<typeof UpdateSpanOutputSchema>) {
  const { spanId, projectId, output } = UpdateSpanOutputSchema.parse(input);

  const [updatedSpan] = await db
    .update(spans)
    .set({
      output,
    })
    .where(and(eq(spans.spanId, spanId), eq(spans.projectId, projectId)))
    .returning();

  if (!updatedSpan) {
    throw new Error("Span not found");
  }

  return updatedSpan;
}
