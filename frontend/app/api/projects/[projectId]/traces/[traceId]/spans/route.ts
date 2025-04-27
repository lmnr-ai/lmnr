import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { searchSpans } from '@/lib/clickhouse/spans';
import { SpanSearchType } from '@/lib/clickhouse/types';
import { TimeRange } from '@/lib/clickhouse/utils';
import { db } from '@/lib/db/drizzle';
import { spans } from '@/lib/db/migrations/schema';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;
  const searchQuery = req.nextUrl.searchParams.get("search");
  const searchType = req.nextUrl.searchParams.getAll("searchIn");

  let searchSpanIds = null;
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

  const spanItems = await db.query.spans.findMany({
    where: and(
      eq(spans.traceId, traceId),
      eq(spans.projectId, projectId),
      // ...(searchSpanIds ? [inArray(spans.spanId, searchSpanIds)] : [])
    ),
    columns: {
      spanId: true,
      startTime: true,
      endTime: true,
      traceId: true,
      parentSpanId: true,
      name: true,
      attributes: true,
      spanType: true,
      // inputs and outputs are intentionally ignored and marked so explicitly
      input: false,
      output: false,
    },
    orderBy: asc(spans.startTime),
    with: {
      events: true,
    },
  });

  // TODO: we should return all span items as a key, and the
  // searchSpanIds as a separate key, and then somehow filter-out/highlight
  // the searchSpanIds in the UI
  return NextResponse.json(spanItems);
}
