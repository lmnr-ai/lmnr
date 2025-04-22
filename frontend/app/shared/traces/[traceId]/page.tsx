import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import TraceView from "@/components/shared/traces/trace-view";
import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";
import { Trace } from "@/lib/traces/types";

export default async function SharedTracePage(props: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await props.params;

  const trace = (await db.query.traces.findFirst({
    where: eq(traces.id, traceId),
  })) as undefined | Trace;

  // TODO: make check by visibility
  // || trace.visibility !== "public"
  if (!trace) {
    return notFound();
  }

  return <TraceView trace={trace} spans={[]} {...props} />;
}
