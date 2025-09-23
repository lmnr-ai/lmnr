import { notFound } from "next/navigation";

import Trace from "@/components/traces/trace";
import { getTrace } from "@/lib/actions/trace";

export default async function TracePage(props: { params: Promise<{ projectId: string; traceId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const trace = await getTrace({ projectId, traceId });

  if (!trace) {
    return notFound();
  }

  return <Trace trace={trace} />;
}
