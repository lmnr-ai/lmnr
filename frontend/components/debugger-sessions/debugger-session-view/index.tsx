"use client";

import { type ComponentProps } from "react";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";
import { type TraceRow } from "@/lib/traces/types";

import DebuggerSessionViewContent from "./debugger-session-view-content";
import DebuggerSessionViewStoreProvider from "./store";

interface DebuggerSessionViewProps {
  // Single-trace harness (/alpha) passes a hydrated trace; multi-trace sessions pass sessionId.
  trace?: TraceViewTrace;
  // Breadcrumb path; when omitted falls back to the first trace.
  headerPath?: ComponentProps<typeof Header>["path"];
  // Debugger session id — drives the trace fetch + realtime span streaming.
  sessionId?: string;
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

export default function DebuggerSessionView({ trace, headerPath, sessionId }: DebuggerSessionViewProps) {
  const path = headerPath ?? (trace ? `traces/${trace.id}` : "traces");
  const sessionTitle = titleFromPath(path);
  const initialTraceRow = trace ? traceToRow(trace) : undefined;

  return (
    <DebuggerSessionViewStoreProvider
      key={sessionId ?? trace?.id}
      initialTraceRow={initialTraceRow}
      initialSessionName={sessionTitle}
    >
      <Header path={path} />
      <div className="flex-none border-t" />
      <DebuggerSessionViewContent sessionId={sessionId} />
    </DebuggerSessionViewStoreProvider>
  );
}
