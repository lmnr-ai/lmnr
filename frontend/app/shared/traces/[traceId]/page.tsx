import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import TraceView from "@/components/shared/traces/trace-view";
import { db } from "@/lib/db/drizzle";
import { spans, traces } from "@/lib/db/migrations/schema";
import { Span, Trace } from "@/lib/traces/types";

export default async function SharedTracePage(props: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await props.params;

  const trace = (await db.query.traces.findFirst({
    where: eq(traces.id, traceId),
  })) as undefined | Trace;

  if (!trace || trace.visibility !== "public") {
    return notFound();
  }

  const spansResult = (await db.query.spans.findMany({
    where: eq(spans.traceId, traceId),
    orderBy: asc(spans.startTime),
    with: {
      events: true,
    },
  })) as unknown as Span[];

  return <TraceView trace={trace} spans={spansResult} />;
}
