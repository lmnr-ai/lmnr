"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";

import TracePicker from "@/components/traces/trace-picker";
import type { TraceRow } from "@/lib/traces/types";

import { useDebuggerSessionStore } from "../store";

export default function TracesTab() {
  const { projectId } = useParams<{ projectId: string }>();
  const { loadHistoryTrace, trace } = useDebuggerSessionStore((state) => ({
    loadHistoryTrace: state.loadHistoryTrace,
    trace: state.trace,
  }));

  const handleTraceSelect = useCallback(
    (t: TraceRow) => {
      if (t.id === trace?.id) return;
      loadHistoryTrace(projectId, t.id, t.startTime, t.endTime);
    },
    [projectId, trace?.id, loadHistoryTrace]
  );

  return (
    <TracePicker
      onTraceSelect={handleTraceSelect}
      focusedTraceId={trace?.id}
      fetchParams={{ traceType: "DEFAULT" }}
      description="Select a trace to rerun in debugger. Trace structure must match the agent you are running locally."
    />
  );
}
