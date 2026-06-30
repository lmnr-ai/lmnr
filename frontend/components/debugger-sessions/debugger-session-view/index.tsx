"use client";

import { type ComponentProps, useEffect } from "react";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";
import { track } from "@/lib/posthog";
import { type TraceRow } from "@/lib/traces/types";

import DebuggerSessionViewContent from "./debugger-session-view-content";
import DebuggerSessionViewStoreProvider, { useDebuggerSessionViewStore } from "./store";

interface DebuggerSessionViewProps {
  // Single-trace harness (/alpha) passes a hydrated trace; multi-trace sessions pass sessionId.
  trace?: TraceViewTrace;
  // Breadcrumb path; when omitted falls back to the first trace.
  headerPath?: ComponentProps<typeof Header>["path"];
  // Debugger session id — drives the trace fetch + realtime span streaming.
  sessionId?: string;
  // The session's real name (null when never named). Seeds the editable title's
  // raw name so it can show a "Set session name" placeholder vs. the breadcrumb,
  // which falls back to the id.
  initialName?: string | null;
}

// Last breadcrumb segment is the session/trace title rendered in the header.
const titleFromPath = (path: ComponentProps<typeof Header>["path"]): string => {
  if (Array.isArray(path)) return path[path.length - 1]?.name ?? "Session";
  return path.split("/").pop() ?? "Session";
};

// Map the /alpha `TraceViewTrace` (metadata is a JSON string) onto a minimal
// `TraceRow` (metadata is an object) so it can seed the store's base `traces`.
const traceToRow = (trace: TraceViewTrace): TraceRow => {
  let metadata: Record<string, string>;
  try {
    const parsed = JSON.parse(trace.metadata) as Record<string, unknown>;
    metadata = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, typeof v === "string" ? v : String(v)]));
  } catch {
    metadata = {};
  }
  return {
    id: trace.id,
    startTime: trace.startTime,
    endTime: trace.endTime,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    totalTokens: trace.totalTokens,
    cacheReadInputTokens: trace.cacheReadInputTokens,
    inputCost: trace.inputCost,
    outputCost: trace.outputCost,
    totalCost: trace.totalCost,
    traceType: (trace.traceType as TraceRow["traceType"]) ?? "DEFAULT",
    sessionId: trace.sessionId,
    metadata,
    userId: trace.userId,
    status: trace.status,
    spanTags: [],
    traceTags: [],
  };
};

// Breadcrumb that tracks live renames: the store's `sessionName` (updated by the
// realtime `session_update` handler) replaces the last path segment's name. Must
// render inside the store provider.
function LiveSessionBreadcrumb({ path }: { path: ComponentProps<typeof Header>["path"] }) {
  const sessionName = useDebuggerSessionViewStore((s) => s.sessionName);
  const livePath = Array.isArray(path)
    ? path.map((segment, i) => (i === path.length - 1 ? { ...segment, name: sessionName } : segment))
    : path;
  return <Header path={livePath} />;
}

export default function DebuggerSessionView({ trace, headerPath, sessionId, initialName }: DebuggerSessionViewProps) {
  // Multi-trace session view (not the /alpha single-trace harness) is a viewed session.
  useEffect(() => {
    if (sessionId) track("debugger_sessions", "session_viewed");
  }, [sessionId]);

  const path = headerPath ?? (trace ? `traces/${trace.id}` : "traces");
  const sessionTitle = titleFromPath(path);
  const initialTraceRow = trace ? traceToRow(trace) : undefined;

  return (
    <DebuggerSessionViewStoreProvider
      key={sessionId ?? trace?.id}
      initialTraceRow={initialTraceRow}
      initialSessionName={sessionTitle}
      initialSessionNameRaw={initialName ?? null}
    >
      <LiveSessionBreadcrumb path={path} />
      <div className="flex-none border-t" />
      <DebuggerSessionViewContent sessionId={sessionId} />
    </DebuggerSessionViewStoreProvider>
  );
}
