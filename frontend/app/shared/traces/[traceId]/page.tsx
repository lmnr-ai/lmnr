import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import TraceView from "@/components/shared/traces/trace-view";
import { db } from "@/lib/db/drizzle";
import { events, spans, traces } from "@/lib/db/migrations/schema";
import { Span, Trace } from "@/lib/traces/types";

export default async function SharedTracePage(props: {
  params: Promise<{ traceId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { traceId } = await props.params;

  const trace = (await db.query.traces.findFirst({
    where: eq(traces.id, traceId),
  })) as undefined | Trace;

  if (!trace || trace.visibility !== "public") {
    return notFound();
  }

  const spanEventsQuery = db.$with("span_events").as(
    db
      .select({
        spanId: events.spanId,
        events: sql`jsonb_agg(jsonb_build_object(
        'id', events.id,
        'spanId', events.span_id,
        'timestamp', events.timestamp,
        'name', events.name,
        'attributes', events.attributes
      ))`.as("events"),
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

  const spansQueryResult = (await db
    .with(spanEventsQuery)
    .select({
      // inputs and outputs are ignored on purpose
      spanId: spans.spanId,
      startTime: spans.startTime,
      endTime: spans.endTime,
      traceId: spans.traceId,
      parentSpanId: spans.parentSpanId,
      name: spans.name,
      attributes: spans.attributes,
      spanType: spans.spanType,
      events: sql`COALESCE(${spanEventsQuery.events}, '[]'::jsonb)`.as("events"),
      input: spans.input,
      output: spans.output,
      inputUrl: spans.inputUrl,
      outputUrl: spans.outputUrl,
      status: spans.status,
    })
    .from(spans)
    .leftJoin(spanEventsQuery, and(eq(spans.spanId, spanEventsQuery.spanId)))
    .where(and(eq(spans.traceId, traceId)))
    .orderBy(asc(spans.startTime))) as unknown as Span[];

  return <TraceView trace={trace} spans={spansQueryResult} />;
}
