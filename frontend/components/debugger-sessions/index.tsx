"use client";

import React from "react";

import DebuggerSessionView from "@/components/debugger-sessions/debugger-session-view";
import DebuggerSessionStoreProvider from "@/components/debugger-sessions/debugger-session-view/debugger-session-store";
import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";
import {
  type DebuggerSession as DebuggerSessionType,
  type DebuggerSessionStatus,
} from "@/lib/actions/debugger-sessions";

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
  params,
  session,
  trace,
  initialStatus,
}: {
  projectId: string;
  params: Array<any>;
  session: DebuggerSessionType;
  trace?: TraceViewTrace;
  initialStatus?: DebuggerSessionStatus;
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
    <DebuggerSessionStoreProvider
      trace={trace}
      params={params}
      storeKey={`debugger-session-${session.id}`}
      initialStatus={initialStatus}
    >
      <DebuggerSessionContent sessionId={session.id} />
    </DebuggerSessionStoreProvider>
  </>
);

export default DebuggerSession;
