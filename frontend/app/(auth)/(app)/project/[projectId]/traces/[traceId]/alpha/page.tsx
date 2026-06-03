import { notFound } from "next/navigation";

import UltimateTraceView from "@/components/ultimate-trace-view";
import { getTrace } from "@/lib/actions/trace";

export default async function UltimateTraceViewPage(props: {
  params: Promise<{ projectId: string; traceId: string }>;
}) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const trace = await getTrace({ projectId, traceId });

  if (!trace) {
    return notFound();
  }

  return <UltimateTraceView trace={trace} />;
}
