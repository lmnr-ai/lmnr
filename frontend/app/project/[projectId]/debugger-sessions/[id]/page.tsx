import { notFound } from "next/navigation";

import DebuggerSession from "@/components/debugger-sessions";
import {
  type DebuggerSession as DebuggerSessionType,
  type DebuggerSessionStatus,
  getDebuggerSession,
  getLatestTraceBySessionId,
} from "@/lib/actions/debugger-sessions";

export default async function DebuggerSessionPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await props.params;

  let session;
  let trace;
  try {
    session = await getDebuggerSession({ projectId, id });
  } catch {
    return notFound();
  }

  if (!session) return notFound();

  try {
    trace = await getLatestTraceBySessionId({ projectId, sessionId: id });
  } catch {
    trace = undefined;
  }

  return (
    <DebuggerSession
      projectId={projectId}
      params={session.params as Array<any>}
      session={session as DebuggerSessionType}
      trace={trace}
      initialStatus={session.status as DebuggerSessionStatus}
    />
  );
}
