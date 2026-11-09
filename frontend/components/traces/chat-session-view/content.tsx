"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";

import { SessionPreviewSelectTraceProvider } from "@/components/traces/session-preview/select-trace-context";

import SessionHeader from "./header";
import Thread from "./thread";
import TracePanel from "./trace-panel";
import { useOpenTrace } from "./use-open-trace";

export default function ChatSessionContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const { openTraceId, toggleTrace } = useOpenTrace();

  // Picking a turn in the trace header's session preview slides that turn's trace in.
  const selectTrace = useCallback(
    (traceId: string) => {
      if (openTraceId !== traceId) toggleTrace(traceId);
    },
    [openTraceId, toggleTrace]
  );

  return (
    <SessionPreviewSelectTraceProvider value={selectTrace}>
      <div className="flex h-full w-full min-w-0 overflow-hidden">
        {/* The header spans only the thread column; the trace panel takes the full height beside it. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <SessionHeader projectId={projectId} />
          <div className="flex-none border-t" />
          <Thread />
        </div>
        <TracePanel />
      </div>
    </SessionPreviewSelectTraceProvider>
  );
}
