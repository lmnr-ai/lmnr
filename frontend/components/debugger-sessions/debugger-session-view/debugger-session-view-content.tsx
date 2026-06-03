"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import FillWidthLayout, { type SessionViewPanels } from "@/components/traces/session-view/fill-width-layout";
import SessionPanel from "@/components/traces/session-view/session-panel";
import SessionSpanPanel from "@/components/traces/session-view/session-span-panel";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeSpan } from "@/lib/traces/types";

import SessionHeader from "./session-header";
import SessionOutline from "./session-outline";
import { useDebuggerSessionViewStoreRaw } from "./store";

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

export default function DebuggerSessionViewContent({
  sessionId,
  sessionTitle,
}: {
  sessionId?: string;
  sessionTitle: string;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const storeApi = useDebuggerSessionViewStoreRaw();

  const { traces, spanPanelOpen } = useSessionViewBaseStore(
    (s) => ({ traces: s.traces, spanPanelOpen: s.spanPanelOpen }),
    shallow
  );

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

  const panels: SessionViewPanels = useMemo(
    () => ({
      // Debugger: no search, no timeline (no slots passed → no concrete-store hook runs).
      sessionPanel: <SessionPanel />,
      spanPanel: <SessionSpanPanel />,
      showSpan: spanPanelOpen,
    }),
    [spanPanelOpen]
  );

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <div className="flex flex-col flex-1 min-w-0">
        <SessionHeader
          title={sessionTitle}
          createdMs={createdMs}
          lastActivityMs={lastActivityMs}
          runCount={traces.length}
        />
        <div className="flex-1 min-h-0">
          <FillWidthLayout panels={panels} />
        </div>
      </div>
      {/* Outline shows only when the span panel is closed; the span panel (inside
          FillWidthLayout) replaces it when open. */}
      {!spanPanelOpen && <SessionOutline className="hidden w-[220px] flex-none border-l px-4 py-6 lg:flex" />}
    </div>
  );
}
