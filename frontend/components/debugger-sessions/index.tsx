"use client";

import React from "react";

import DebuggerSessionView from "@/components/debugger-sessions/debugger-session-view";
import DebuggerSessionStoreProvider from "@/components/debugger-sessions/debugger-session-view/store";
import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";
import { type DebuggerSession as DebuggerSessionType } from "@/lib/actions/debugger-sessions";

interface DebuggerSessionContentProps {
  sessionId: string;
}

const DebuggerSessionContent = ({ sessionId }: DebuggerSessionContentProps) => (
  <div className="flex-1 min-h-0 flex">
    <DebuggerSessionView sessionId={sessionId} />
  </div>
);

const DebuggerSession = ({
  projectId,
  session,
  trace,
}: {
  projectId: string;
  session: DebuggerSessionType;
  trace?: TraceViewTrace;
}) => (
  <>
    <Header
      path={[
        { name: "debugger sessions", href: `/project/${projectId}/debugger-sessions` },
        { name: session.name ?? "-", copyValue: session.id },
      ]}
      childrenContainerClassName="flex-none mr-2 h-12"
    />
    <div className="flex-none border-t" />
    <DebuggerSessionStoreProvider trace={trace} storeKey={`debugger-session-${session.id}`}>
      <DebuggerSessionContent sessionId={session.id} />
    </DebuggerSessionStoreProvider>
  </>
);

export default DebuggerSession;
