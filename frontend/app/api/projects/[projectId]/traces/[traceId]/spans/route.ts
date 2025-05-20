import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { searchSpans } from '@/lib/clickhouse/spans';
import { SpanSearchType } from '@/lib/clickhouse/types';
import { TimeRange } from '@/lib/clickhouse/utils';
import { db } from '@/lib/db/drizzle';
import { events, spans } from '@/lib/db/migrations/schema'; export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;
  const searchQuery = req.nextUrl.searchParams.get("search");
  const searchType = req.nextUrl.searchParams.getAll("searchIn");
  let searchSpanIds: string[] = [];
  if (searchQuery) {
    const timeRange = { pastHours: 'all' } as TimeRange;
    const searchResult = await searchSpans({
      projectId,
      searchQuery,
      timeRange,
      traceId,
      searchType: searchType as SpanSearchType[]
    });

    searchSpanIds = Array.from(searchResult.spanIds);
  }

  const spanEventsQuery = db.$with('span_events').as(
    db.select({
      spanId: events.spanId,
      projectId: events.projectId,
      events: sql`jsonb_agg(jsonb_build_object(
        'id', events.id,
        'spanId', events.span_id,
        'timestamp', events.timestamp,
        'name', events.name,
        'attributes', events.attributes
      ))`.as('events')
    })
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          // This check may seem redundant because there is a join statement below,
          // but it makes much wiser use of indexes and is much faster (up to 1000x in theory)
          inArray(events.spanId, sql`(SELECT span_id FROM spans
            WHERE project_id = ${projectId} AND trace_id = ${traceId}
            ${searchSpanIds.length > 0 ? sql`AND span_id IN ${searchSpanIds}` : sql``}
          )`)
        )
      )
      .groupBy(events.spanId, events.projectId)
  );

  const spanItems = await db.with(spanEventsQuery).select({
    // inputs and outputs are ignored on purpose
    spanId: spans.spanId,
    startTime: spans.startTime,
    endTime: spans.endTime,
    traceId: spans.traceId,
    parentSpanId: spans.parentSpanId,
    name: spans.name,
    attributes: spans.attributes,
    spanType: spans.spanType,
    events: sql`COALESCE(${spanEventsQuery.events}, '[]'::jsonb)`.as('events'),
  })
    .from(spans)
    .leftJoin(spanEventsQuery,
      and(
        eq(spans.spanId, spanEventsQuery.spanId),
        eq(spans.projectId, spanEventsQuery.projectId)
      )
    )
    .where(
      and(
        eq(spans.traceId, traceId),
        eq(spans.projectId, projectId),
        ...(searchQuery !== null ? [inArray(spans.spanId, searchSpanIds)] : [])
      )
    )
    .orderBy(asc(spans.startTime));

  // For now we flatten the span tree in the front-end if there is a search query,
  // so we explicitly set the parentSpanId to null
  return NextResponse.json(spanItems.map((span) => ({
    ...span,
    parentSpanId: searchSpanIds.length > 0 ? null : span.parentSpanId,
  })));
}
