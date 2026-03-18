"use client";

import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";
import { cn } from "@/lib/utils";

import AddTraceButton from "./add-trace-button";
import PanelContainer from "./panels/panel-container";
import {
  createUltimateTraceViewStore,
  type TraceSignalEvent,
  type TraceSignalInfo,
  UltimateTraceViewContext,
  useUltimateTraceViewStore,
  useUltimateTraceViewStoreRaw,
} from "./store";
import Timeline from "./timeline";
import TraceHeader from "./trace-header";
import { useBlockSummaries } from "./use-block-summaries";
import { signalIdToColor } from "./utils";

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
  const storeApi = useUltimateTraceViewStoreRaw();

  const traceOrder = useUltimateTraceViewStore((state) => state.traceOrder);

  // Track which traces we've already fetched
  const fetchedRef = useRef<Set<string>>(new Set());

  const fetchTraceAndSpans = useCallback(
    async (tid: string) => {
      const { setTraceData, setSpans, setIsTraceLoading, setIsSpansLoading, setTraceError, setSpansError, setSignals } =
        storeApi.getState();

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

        // Fetch signals for this trace (non-blocking, best effort)
        fetchSignalsForTrace(tid, spans);
      } catch {
        storeApi.getState().setTraceError(tid, "Failed to load trace data");
      } finally {
        storeApi.getState().setIsTraceLoading(tid, false);
        storeApi.getState().setIsSpansLoading(tid, false);
      }
    },
    [projectId, storeApi]
  );

  const fetchSignalsForTrace = useCallback(
    async (tid: string, spans: TraceViewSpan[]) => {
      const { setSignals } = storeApi.getState();
      try {
        const signalsRes = await fetch(`/api/projects/${projectId}/traces/${tid}/signals`);
        if (!signalsRes.ok) return;
        const events = (await signalsRes.json()) as TraceSignalEvent[];
        if (events.length === 0) return;

        // Group events by signal_id
        const bySignal = new Map<string, TraceSignalEvent[]>();
        for (const event of events) {
          const existing = bySignal.get(event.signal_id) ?? [];
          existing.push(event);
          bySignal.set(event.signal_id, existing);
        }

        // Build TraceSignalInfo for each signal with fake span associations
        const spanIds = spans.map((s) => s.spanId);
        const signalInfos: TraceSignalInfo[] = [];
        for (const [signalId, signalEvents] of bySignal) {
          // Pick up to 3 random spans as fake associations
          const shuffled = [...spanIds].sort(() => Math.random() - 0.5);
          const associatedSpanIds = shuffled.slice(0, Math.min(3, shuffled.length));
          signalInfos.push({
            signalId,
            signalName: signalEvents[0].signal_name,
            color: signalIdToColor(signalId),
            associatedSpanIds,
            events: signalEvents,
          });
        }
        setSignals(tid, signalInfos);
      } catch {
        // Signals are non-critical, silently fail
      }
    },
    [projectId, storeApi]
  );

  // Fetch data for any new traces that appear in the order
  useEffect(() => {
    for (const tid of traceOrder) {
      if (!fetchedRef.current.has(tid)) {
        fetchedRef.current.add(tid);
        fetchTraceAndSpans(tid);
      }
    }
  }, [traceOrder, fetchTraceAndSpans]);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      {traceOrder.map((tid) => (
        <TraceSection key={tid} traceId={tid} />
      ))}
      <AddTraceButton />
      <PanelContainer />
    </div>
  );
}

function TraceSection({ traceId }: { traceId: string }) {
  const exists = useUltimateTraceViewStore((state) => state.traces.has(traceId));
  const hasSpanTree = useUltimateTraceViewStore((state) => !!state.traces.get(traceId)?.spanTree);
  const traceOrder = useUltimateTraceViewStore((state) => state.traceOrder);
  const removeTrace = useUltimateTraceViewStore((state) => state.removeTrace);
  const { generateBlockSummaries } = useBlockSummaries(traceId);

  const isRemovable = traceOrder.indexOf(traceId) > 0;

  // Trigger block summary generation once span tree is built
  useEffect(() => {
    if (hasSpanTree) {
      generateBlockSummaries();
    }
  }, [hasSpanTree, generateBlockSummaries]);

  const handleRemove = useCallback(() => {
    removeTrace(traceId);
  }, [removeTrace, traceId]);

  if (!exists) return null;

  const isSecondary = traceOrder.indexOf(traceId) > 0;

  return (
    <div className={cn("flex flex-col w-full flex-1 min-h-0", isSecondary && "border-t")}>
      <TraceHeader traceId={traceId} onRemove={isRemovable ? handleRemove : undefined} />
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
