import { notFound } from "next/navigation";

import DebuggerSessionView from "@/components/debugger-sessions/debugger-session-view";
import { getDebuggerSession } from "@/lib/actions/debugger-sessions";

export default async function DebuggerSessionPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await props.params;

  const session = await getDebuggerSession({ projectId, id });

  if (!session) return notFound();

  const sessionName = session.name ?? session.id;
  const headerPath = [
    { name: "debugger", href: `/project/${projectId}/debugger-sessions` },
    { name: sessionName, copyValue: session.id },
  ];

  return <DebuggerSessionView headerPath={headerPath} sessionId={session.id} initialName={session.name ?? null} />;
}
