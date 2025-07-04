import { and, asc, eq, inArray, sql } from "drizzle-orm";
import z from "zod/v4";

import { GetSharedTraceSchema } from "@/lib/actions/shared/trace";
import { db } from "@/lib/db/drizzle";
import { events, spans } from "@/lib/db/migrations/schema";
import { Span } from "@/lib/traces/types";

export const getSharedSpans = async (input: z.infer<typeof GetSharedTraceSchema>) => {
  const { traceId } = GetSharedTraceSchema.parse(input);
  const eventsSql = sql`
    jsonb_agg(jsonb_build_object(
      'id', events.id,
      'timestamp', events.timestamp,
      'name', events.name,
      'attributes', events.attributes
      )
  )`;

  const spanEventsQuery = db.$with("span_events").as(
    db
      .select({
        spanId: events.spanId,
        events: eventsSql.as("events"),
      })
      .from(events)
      .where(
        and(
          // This check may seem redundant because there is a join statement below,
          // but it makes much wiser use of indexes and is much faster (up to 1000x in theory)
          inArray(
            events.spanId,
            sql`(SELECT span_id FROM spans
            WHERE trace_id = ${traceId}
          )`
          )
        )
      )
      .groupBy(events.spanId)
  );

  const spansResult = (await db
    .with(spanEventsQuery)
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
      events: sql`COALESCE(${spanEventsQuery.events}, '[]'::jsonb)`.as("events"),
    })
    .from(spans)
    .leftJoin(spanEventsQuery, and(eq(spans.spanId, spanEventsQuery.spanId)))
    .where(and(eq(spans.traceId, traceId)))
    .orderBy(asc(spans.startTime))) as unknown as Span[];

  return spansResult;
};
