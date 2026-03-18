"use client";

import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useEffect, useState } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";

import { createUltimateTraceViewStore, UltimateTraceViewContext, useUltimateTraceViewStore } from "./store";
import Timeline from "./timeline";
import TraceHeader from "./trace-header";

// Store provider
function UltimateTraceViewProvider({
  children,
  traceId,
  initialTrace,
}: PropsWithChildren<{ traceId: string; initialTrace?: TraceViewTrace }>) {
  const [store] = useState(() => createUltimateTraceViewStore(traceId, initialTrace));

  return <UltimateTraceViewContext.Provider value={store}>{children}</UltimateTraceViewContext.Provider>;
}

// Inner content: fetches data and renders trace sections
function UltimateTraceViewContent({ traceId }: { traceId: string }) {
  const { projectId } = useParams<{ projectId: string }>();

  const { setTraceData, setSpans, setIsTraceLoading, setIsSpansLoading, setTraceError, setSpansError, traceOrder } =
    useUltimateTraceViewStore((state) => ({
      setTraceData: state.setTraceData,
      setSpans: state.setSpans,
      setIsTraceLoading: state.setIsTraceLoading,
      setIsSpansLoading: state.setIsSpansLoading,
      setTraceError: state.setTraceError,
      setSpansError: state.setSpansError,
      traceOrder: state.traceOrder,
    }));

  const fetchTraceAndSpans = useCallback(
    async (tid: string) => {
      // Fetch trace
      try {
        setIsTraceLoading(tid, true);
        setTraceError(tid, undefined);
        const traceRes = await fetch(`/api/projects/${projectId}/traces/${tid}`);
        if (!traceRes.ok) {
          setTraceError(tid, "Failed to load trace");
          return;
        }
        const traceData = (await traceRes.json()) as TraceViewTrace;
        setTraceData(tid, traceData);

        // Fetch spans
        setIsSpansLoading(tid, true);
        setSpansError(tid, undefined);
        const params = new URLSearchParams();
        const startDate = new Date(new Date(traceData.startTime).getTime() - 1000);
        const endDate = new Date(new Date(traceData.endTime).getTime() + 1000);
        params.set("startDate", startDate.toISOString());
        params.set("endDate", endDate.toISOString());
        params.append("searchIn", "input");
        params.append("searchIn", "output");

        const spansRes = await fetch(`/api/projects/${projectId}/traces/${tid}/spans?${params.toString()}`);
        if (!spansRes.ok) {
          setSpansError(tid, "Failed to load spans");
          return;
        }
        const spans = (await spansRes.json()) as TraceViewSpan[];
        setSpans(tid, spans);
      } catch {
        setTraceError(tid, "Failed to load trace data");
      } finally {
        setIsTraceLoading(tid, false);
        setIsSpansLoading(tid, false);
      }
    },
    [projectId, setTraceData, setSpans, setIsTraceLoading, setIsSpansLoading, setTraceError, setSpansError]
  );

  useEffect(() => {
    fetchTraceAndSpans(traceId);
  }, [traceId, fetchTraceAndSpans]);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      {traceOrder.map((tid) => (
        <TraceSection key={tid} traceId={tid} />
      ))}
    </div>
  );
}

function TraceSection({ traceId }: { traceId: string }) {
  const exists = useUltimateTraceViewStore((state) => state.traces.has(traceId));

  if (!exists) return null;

  return (
    <div className="flex flex-col w-full flex-1 min-h-0">
      <TraceHeader traceId={traceId} />
      <Timeline traceId={traceId} />
    </div>
  );
}

// Main exported component
export default function UltimateTraceView({ trace }: { trace: TraceViewTrace }) {
  return (
    <>
      <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-none mr-2 h-12" />
      <div className="flex-none border-t" />
      <UltimateTraceViewProvider traceId={trace.id} initialTrace={trace}>
        <UltimateTraceViewContent traceId={trace.id} />
      </UltimateTraceViewProvider>
    </>
  );
}
