import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import TraceView from "@/components/shared/traces/trace-view";
import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { db } from "@/lib/db/drizzle";
import { spans, traces } from "@/lib/db/migrations/schema";
import { Span, Trace } from "@/lib/traces/types";

export default async function SharedTracePage(props: {
  params: Promise<{ traceId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { traceId } = await props.params;
  const { search, searchIn } = await props.searchParams;

  const trace = (await db.query.traces.findFirst({
    where: eq(traces.id, traceId),
  })) as undefined | Trace;

  if (!trace || trace.visibility !== "public") {
    return notFound();
  }

  let searchSpanIds: string[] = [];
  if (search) {
    const searchType = (typeof searchIn === "string" ? searchIn.split(",") : searchIn) ?? [];

    const searchQuery = (typeof search === "string" ? search : search[0]);
    const spansResult = await searchSpans({
      searchQuery,
      timeRange: { pastHours: "all" },
      searchType: searchType as SpanSearchType[],
      traceId,
    });
    searchSpanIds = Array.from(spansResult.spanIds);
  }


  const spansResult = (await db.query.spans.findMany({
    where: eq(spans.traceId, traceId),
    orderBy: asc(spans.startTime),
    with: {
      events: true,
    },
  })) as unknown as Span[];

  // TODO: return the searchSpanIds as a separate key, and then somehow filter-out/highlight
  // the searchSpanIds in the UI
  return <TraceView trace={trace} spans={spansResult} />;
}
