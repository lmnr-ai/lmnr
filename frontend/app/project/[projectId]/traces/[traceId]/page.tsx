import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import Trace from "@/components/traces/trace";
import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";
import { Trace as TraceType } from "@/lib/traces/types";
export default async function TracePage(props: { params: Promise<{ projectId: string; traceId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const trace = (await db.query.traces.findFirst({
    where: and(eq(traces.projectId, projectId), eq(traces.id, traceId)),
  })) as undefined | TraceType;

  if (!trace) {
    return notFound();
  }

  return <Trace trace={trace} />;
}
