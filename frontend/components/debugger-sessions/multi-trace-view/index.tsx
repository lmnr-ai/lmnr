"use client";

import { useEffect } from "react";

import DebuggerSessionView from "@/components/debugger-sessions/debugger-session-view";
import { track } from "@/lib/posthog";

interface MultiTraceViewProps {
  projectId: string;
  sessionId: string;
  sessionName: string;
}

/**
 * Debugger session view entry: the debugger view fetches the session's runs
 * itself (via the `rollout.session_id` trace-metadata filter) from `sessionId`,
 * so this wrapper just supplies the breadcrumb path + session id.
 */
export default function MultiTraceView({ projectId, sessionId, sessionName }: MultiTraceViewProps) {
  useEffect(() => {
    track("debugger_sessions", "session_viewed");
  }, []);

  const headerPath = [
    { name: "debugger", href: `/project/${projectId}/debugger-sessions` },
    { name: sessionName, copyValue: sessionId },
  ];

  return <DebuggerSessionView headerPath={headerPath} sessionId={sessionId} />;
}
