import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { events, spans } from "@/lib/db/migrations/schema";

export const GetSharedSpanSchema = z.object({
  spanId: z.string(),
  traceId: z.string(),
});

export const getSharedSpan = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId } = GetSharedSpanSchema.parse(input);

  const span = await db.query.spans.findFirst({
    where: and(eq(spans.spanId, spanId), eq(spans.traceId, traceId)),
  });

  if (!span) {
    throw new Error("Span not found or does not belong to the given trace");
  }

  return span;
};

export const getSharedSpanEvents = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId } = GetSharedSpanSchema.parse(input);

  // First verify the span exists and belongs to the trace
  const span = await db.query.spans.findFirst({
    where: and(eq(spans.spanId, spanId), eq(spans.traceId, traceId)),
    columns: {
      spanId: true,
    },
  });

  if (!span) {
    throw new Error("Span not found or does not belong to the given trace");
  }

  const rows = await db.query.events.findMany({
    where: and(eq(events.spanId, spanId)),
    orderBy: asc(events.timestamp),
  });

  return rows;
};
