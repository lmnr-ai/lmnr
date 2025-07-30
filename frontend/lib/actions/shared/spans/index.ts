import { and, asc, eq, inArray } from "drizzle-orm";
import { groupBy } from "lodash";
import z from "zod/v4";

import { GetSharedTraceSchema } from "@/lib/actions/shared/trace";
import { db } from "@/lib/db/drizzle";
import { events, spans } from "@/lib/db/migrations/schema";
import { Span } from "@/lib/traces/types";

export const getSharedSpans = async (input: z.infer<typeof GetSharedTraceSchema>) => {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const spansResult = (await db
    .select({
      spanId: spans.spanId,
      startTime: spans.startTime,
      endTime: spans.endTime,
      traceId: spans.traceId,
      parentSpanId: spans.parentSpanId,
      name: spans.name,
      attributes: spans.attributes,
      spanType: spans.spanType,
      status: spans.status,
    })
    .from(spans)
    .where(and(eq(spans.traceId, traceId)))
    .orderBy(asc(spans.startTime))) as unknown as Span[];

  if (spansResult.length === 0) {
    return [];
  }

  // Join in memory, because json aggregation and join in PostgreSQL may be too slow
  // depending on the number of spans and events, and there is no way for us
  // to force PostgreSQL to use the correct indexes always.
  const spanEvents = await db.query.events.findMany({
    where: and(
      inArray(events.spanId, spansResult.map((span) => span.spanId))
    ),
  });

  const spanEventsMap = groupBy(spanEvents, (event) => event.spanId);

  return spansResult.map((span) => ({
    ...span,
    events: (spanEventsMap[span.spanId] || []).map((event) => ({
      ...event,
      attributes: event.attributes as Record<string, any>,
    })),
  }));
};
