import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { sharedSearchSpans } from "@/lib/clickhouse/spans";
import { TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { spans } from "@/lib/db/migrations/schema";

export async function GET(req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const params = await props.params;
  const traceId = params.traceId;
  const searchQuery = req.nextUrl.searchParams.get("search");

  let searchSpanIds = null;
  if (searchQuery) {
    const timeRange = { pastHours: "all" } as TimeRange;
    const searchResult = await sharedSearchSpans(searchQuery, timeRange);
    searchSpanIds = Array.from(searchResult.spanIds);
  }

  const spanItems = await db.query.spans.findMany({
    where: and(eq(spans.traceId, traceId), ...(searchSpanIds ? [inArray(spans.spanId, searchSpanIds)] : [])),
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

  return NextResponse.json(spanItems);
}
