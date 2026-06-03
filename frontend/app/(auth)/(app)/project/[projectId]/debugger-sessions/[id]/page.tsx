import { notFound } from "next/navigation";

import MultiTraceView from "@/components/debugger-sessions/multi-trace-view";
import { getDebuggerSession } from "@/lib/actions/debugger-sessions";

export default async function DebuggerSessionPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await props.params;

  const session = await getDebuggerSession({ projectId, id });

  if (!session) return notFound();

  return <MultiTraceView projectId={projectId} sessionId={session.id} sessionName={session.name ?? session.id} />;
}
