"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TraceViewSidePanel } from "@/components/traces/trace-view";
import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeSpan } from "@/lib/traces/types";

import SessionHeader from "./session-header";
import SessionOutline from "./session-outline";
import { type UltimateTraceViewStore, useUltimateTraceViewStore, useUltimateTraceViewStoreRaw } from "./store";
import TraceSection from "./trace-section";

// Earliest run start / latest run end across loaded traces (epoch ms). Returned
// as primitives so the header only re-renders when the bounds actually move.
const selectCreatedMs = (s: UltimateTraceViewStore): number | undefined => {
  let min: number | undefined;
  for (const tid of s.traceOrder) {
    const t = s.traces.get(tid)?.trace;
    if (!t) continue;
    const ms = new Date(t.startTime).getTime();
    if (!Number.isNaN(ms)) min = min === undefined ? ms : Math.min(min, ms);
  }
  return min;
};

const selectLastActivityMs = (s: UltimateTraceViewStore): number | undefined => {
  let max: number | undefined;
  for (const tid of s.traceOrder) {
    const t = s.traces.get(tid)?.trace;
    if (!t) continue;
    const ms = new Date(t.endTime).getTime();
    if (!Number.isNaN(ms)) max = max === undefined ? ms : Math.max(max, ms);
  }
  return max;
};

// Inner content: fetches data and renders trace sections + the right-rail outline.
export default function UltimateTraceViewContent({
  sessionId,
  sessionTitle,
}: {
  sessionId?: string;
  sessionTitle: string;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const storeApi = useUltimateTraceViewStoreRaw();

  const traceOrder = useUltimateTraceViewStore((state) => state.traceOrder);
  const sidePanelTraceId = useUltimateTraceViewStore((state) => state.sidePanelTraceId);
  const sidePanelSpanId = useUltimateTraceViewStore((state) => state.sidePanelSpanId);
  const closeSidePanel = useUltimateTraceViewStore((state) => state.closeSidePanel);

  const createdMs = useUltimateTraceViewStore(selectCreatedMs);
  const lastActivityMs = useUltimateTraceViewStore(selectLastActivityMs);

  // Ref on the confirmed scroll container (the overflow-y-auto div below) so
  // "Jump to bottom" scrolls it to the very end.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollToBottom = useCallback(() => {
    scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
  }, [scrollEl]);

  // Track which traces we've already fetched
  const fetchedRef = useRef<Set<string>>(new Set());

  const fetchTraceAndSpans = useCallback(
    async (tid: string) => {
      const { setTraceData, setSpans, setIsTraceLoading, setIsSpansLoading, setTraceError, setSpansError } =
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
      } catch {
        storeApi.getState().setTraceError(tid, "Failed to load trace data");
      } finally {
        storeApi.getState().setIsTraceLoading(tid, false);
        storeApi.getState().setIsSpansLoading(tid, false);
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

  // Realtime: stream spans for this session's runs over the same SSE channel the
  // observation surface uses (`rollout_session_{id}`). A span for an unknown
  // trace adds the run live; mark it fetched so the one-shot fetch above doesn't
  // clobber the streamed spans with a (mid-run, possibly emptier) snapshot.
  const eventHandlers = useMemo(
    () => ({
      span_start: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        const span = payload.span as RealtimeSpan | undefined;
        if (!span) return;
        fetchedRef.current.add(span.traceId);
        storeApi.getState().applyRealtimeSpan(span, "start");
      },
      span_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload.spans)) return;
        for (const span of payload.spans as RealtimeSpan[]) {
          fetchedRef.current.add(span.traceId);
          storeApi.getState().applyRealtimeSpan(span, "update");
        }
      },
      // New run detected for this session: add a live slot. We do NOT mark it
      // fetched, so the traceOrder effect one-shot-fetches its trace + spans.
      trace_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload.traces)) return;
        for (const t of payload.traces as { traceId?: string }[]) {
          if (t.traceId) storeApi.getState().ensureTrace(t.traceId);
        }
      },
    }),
    [storeApi]
  );

  useRealtime({
    key: `rollout_session_${sessionId}`,
    projectId: projectId as string,
    enabled: !!sessionId && !!projectId,
    eventHandlers,
  });

  return (
    <div className="relative flex flex-1 min-h-0 w-full">
      {/* Native scroll container owns the scrollbar. Inside it, a centered row
          pairs the article column with the right-rail outline (Figma 4296:35652). */}
      <div ref={setScrollEl} className="thin-scrollbar min-h-0 w-full flex-1 scroll-smooth overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1040px] gap-20 px-6 pb-[160px]">
          <div className="min-w-0 flex-1">
            <SessionHeader
              title={sessionTitle}
              createdMs={createdMs}
              lastActivityMs={lastActivityMs}
              runCount={traceOrder.length}
            />
            <div className="flex flex-col gap-12">
              {traceOrder.map((tid, i) => (
                <TraceSection key={tid} traceId={tid} index={i + 1} total={traceOrder.length} />
              ))}
            </div>
          </div>
          <SessionOutline
            onJumpToBottom={scrollToBottom}
            className="sticky top-[160px] hidden max-h-[calc(100vh-2rem)] w-[220px] flex-none self-start lg:flex"
          />
        </div>
      </div>
      {sidePanelTraceId && (
        <TraceViewSidePanel traceId={sidePanelTraceId} spanId={sidePanelSpanId ?? undefined} onClose={closeSidePanel} />
      )}
    </div>
  );
}
