import { notFound } from "next/navigation";

import DebuggerSessionView from "@/components/debugger-sessions/debugger-session-view";
import { getTrace } from "@/lib/actions/trace";

export default async function DebuggerSessionViewPage(props: {
  params: Promise<{ projectId: string; traceId: string }>;
}) {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const trace = await getTrace({ projectId, traceId });

  if (!trace) {
    return notFound();
  }

  return <DebuggerSessionView trace={trace} />;
}
