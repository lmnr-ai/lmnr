"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import SessionSpanPanel from "@/components/traces/session-view/session-span-panel";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeSpan } from "@/lib/traces/types";

import DebuggerTraceList from "./debugger-trace-list";
import SessionHeader from "./session-header";
import SessionOutline from "./session-outline";
import { useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "./store";

// Earliest run start / latest run end across loaded traces (epoch ms).
const minMaxFromTraces = (traces: { startTime: string; endTime: string }[]) => {
  let min: number | undefined;
  let max: number | undefined;
  for (const t of traces) {
    const s = new Date(t.startTime).getTime();
    const e = new Date(t.endTime).getTime();
    if (!Number.isNaN(s)) min = min === undefined ? s : Math.min(min, s);
    if (!Number.isNaN(e)) max = max === undefined ? e : Math.max(max, e);
  }
  return { createdMs: min, lastActivityMs: max };
};

// Inner content: restores the user's hand-placed shell (page scroll container,
// sticky LEFT outline, 720px article column, right spacer; span view via an
// overlaying TraceViewSidePanel) wired to the new composed store. The ONLY UI
// change vs 0b1f5435c is the article column's trace cards (now the virtualized
// session-view trace items in DebuggerTraceList).
export default function DebuggerSessionViewContent({
  sessionId,
  sessionTitle,
}: {
  sessionId?: string;
  sessionTitle: string;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const storeApi = useDebuggerSessionViewStoreRaw();

  const { traces, selectedSpan } = useSessionViewBaseStore(
    (s) => ({ traces: s.traces, selectedSpan: s.selectedSpan }),
    shallow
  );

  // Full trace-view overlay state (opened only by the trace-card dropdown's
  // "Open trace view"; span clicks open the span panel via selectedSpan instead).
  const traceViewTraceId = useDebuggerSessionViewStore((s) => s.traceViewTraceId);
  const closeTraceView = useDebuggerSessionViewStore((s) => s.closeTraceView);

  // The page-owned scroll container — the virtualizer (DebuggerTraceList) binds
  // to it and the outline shares the same scroll context.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  // Push projectId into the store so store-owned actions can issue requests.
  useEffect(() => {
    storeApi.getState().setProjectId(projectId);
  }, [projectId, storeApi]);

  // Initial fetch of the session's runs (skipped for the /alpha single-trace
  // harness, which seeded base `traces` with one row at store creation).
  useEffect(() => {
    if (!sessionId) return;
    void storeApi.getState().fetchSessionTraces(sessionId);
  }, [sessionId, storeApi]);

  const { createdMs, lastActivityMs } = useMemo(() => minMaxFromTraces(traces), [traces]);

  // Realtime: stream spans + new-run/note updates over the session's SSE channel.
  const eventHandlers = useMemo(
    () => ({
      span_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload.spans)) return;
        for (const span of payload.spans as RealtimeSpan[]) {
          storeApi.getState().applyRealtimeSpan(span);
        }
      },
      trace_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload.traces)) return;
        for (const t of payload.traces as { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }[]) {
          storeApi.getState().applyTraceUpdate(t);
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
    // No `relative` here: the side panel (absolute top-0 bottom-0) intentionally
    // anchors to the layout's SidebarInset so it covers the breadcrumb row too,
    // matching the traces page. A relative wrapper would trap it below the header.
    <div className="flex flex-1 min-h-0 w-full">
      {/* Native scroll container owns the scrollbar. Inside it, a centered row
          pairs the article column with the right-rail outline (Figma 4296:35652). */}
      <div ref={setScrollEl} className="thin-scrollbar min-h-0 w-full flex-1 scroll-smooth overflow-y-auto">
        <div className="mx-auto flex w-full gap-16 px-6 pb-[160px]">
          <div className="flex flex-1 shrink-0 justify-center">
            <SessionOutline className="sticky top-[180px] hidden max-h-[calc(100vh-2rem)] w-[220px] flex-none self-start lg:flex" />
          </div>
          <div className="min-w-0 w-[720px]">
            <SessionHeader
              title={sessionTitle}
              createdMs={createdMs}
              lastActivityMs={lastActivityMs}
              runCount={traces.length}
            />
            <DebuggerTraceList scrollEl={scrollEl} projectId={projectId} />
          </div>
          <div className="flex flex-1" />
        </div>
      </div>
      {/* Span click → SPAN panel: reuse session view's SessionSpanPanel verbatim,
          dropped into an absolute right overlay (same anchoring as TraceViewSidePanel,
          NOT a resizable shell). SessionSpanPanel reads the base store the debugger
          provider supplies, and its close calls setSpanPanelOpen(false) which clears
          selectedSpan — so the `selectedSpan` gate handles open AND close. */}
      {selectedSpan && (
        <div className="absolute top-0 right-0 bottom-0 z-50 flex w-[600px] max-w-[calc(100%-80px)] border-l bg-background">
          <SessionSpanPanel />
        </div>
      )}
      {/* Dropdown "Open trace view" → full trace-view overlay (no navigation). */}
      {traceViewTraceId && <TraceViewSidePanel traceId={traceViewTraceId} onClose={closeTraceView} />}
    </div>
  );
}
