"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import SessionSpanPanel from "@/components/traces/session-view/session-span-panel";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeSpan } from "@/lib/traces/types";

import DebuggerTraceList from "./debugger-trace-list";
import NewTracePill from "./new-trace-pill";
import SessionHeader from "./session-header";
import SessionOutline from "./session-outline";
import { useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "./store";

// How close to the bottom counts as "pinned" for stick-to-bottom. Small enough
// that a deliberate scroll-up unpins immediately; big enough that sub-pixel
// rounding and momentum-scroll settle don't break the pin.
const PIN_SLACK_PX = 40;

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
export default function DebuggerSessionViewContent({ sessionId }: { sessionId?: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const storeApi = useDebuggerSessionViewStoreRaw();

  const { traces, spanPanelOpen } = useSessionViewBaseStore(
    (s) => ({ traces: s.traces, spanPanelOpen: s.spanPanelOpen }),
    shallow
  );

  // Full trace-view overlay state (opened only by the trace-card dropdown's
  // "Open trace view"; span clicks open the span panel via selectedSpan instead).
  const traceViewTraceId = useDebuggerSessionViewStore((s) => s.traceViewTraceId);
  const closeTraceView = useDebuggerSessionViewStore((s) => s.closeTraceView);

  // Displayed session title — store-backed so `session_update` (rename) reflects
  // live. Seeded from the breadcrumb prop at store creation (index.tsx).
  const sessionName = useDebuggerSessionViewStore((s) => s.sessionName);

  // The page-owned scroll container — the virtualizer (DebuggerTraceList) binds
  // to it and the outline shares the same scroll context.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  // "Jump to bottom" against the page scroll container (restored from the
  // pre-rework content component — the virtualizer keeps scrollHeight sized via
  // its total-size spacer, so scrolling the container itself stays correct).
  const scrollToBottom = useCallback(() => {
    scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
  }, [scrollEl]);

  // iMessage-style pinning: while the user sits at (or near) the bottom, keep
  // them there as streamed spans/traces grow the content. Pinned-ness is a ref
  // updated on every user scroll; a ResizeObserver on the content column snaps
  // the scroll back down whenever the content height changes while pinned.
  // Scrolling up past the slack unpins, so reading history is never hijacked.
  useEffect(() => {
    if (!scrollEl) return;
    const pinned = { current: false };
    const measure = () => {
      pinned.current = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - PIN_SLACK_PX;
    };
    measure();
    scrollEl.addEventListener("scroll", measure, { passive: true });
    const content = scrollEl.firstElementChild;
    const observer = new ResizeObserver(() => {
      // Instant (not smooth) — growth can come every frame while streaming and
      // queued smooth scrolls would rubber-band.
      if (pinned.current) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
    if (content) observer.observe(content);
    return () => {
      scrollEl.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [scrollEl]);

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
      // Session renamed (PATCH /v1/.../rollouts/{id}/name) → update the title live.
      // Payload is `{sessionId, name}` (camelCase, see app-server rollouts.rs::update_name).
      session_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { sessionId?: string; name?: string };
        if (payload.sessionId === sessionId && typeof payload.name === "string") {
          storeApi.getState().setSessionName(payload.name);
        }
      },
    }),
    [storeApi, sessionId]
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
          pairs the article column with the right-rail outline (Figma 4296:35652).
          min-w-0 lets the in-flow span panel compress this side smoothly. */}
      <div ref={setScrollEl} className="thin-scrollbar min-h-0 min-w-0 flex-1 scroll-smooth overflow-y-auto">
        <div className="mx-auto flex w-full gap-16 px-6">
          <div className="flex min-w-0 grow-1 justify-center shrink-0">
            {/* Hidden while the span panel is open so this spacer carries no
                min-width (the outline's 220px) and the article can slide left. */}
            {/* Sticky full-height rail: top-0 + h-screen + pt instead of
                top-[180px], so the outline is hard-bounded by the viewport and
                scrolls internally only when it's truly too long. pb covers the
                breadcrumb row above the scroll container plus breathing room. */}
            {!spanPanelOpen && (
              <div className="sticky top-0 hidden h-screen w-[220px] flex-none shrink-0 self-start pb-16 pt-[180px] lg:flex">
                <SessionOutline className="max-h-full w-full" />
              </div>
            )}
          </div>
          {/* Bottom padding lives on the article column (not the page row) so
              only the traces/notes get the scroll-past room. */}
          <div className="min-w-0 w-[720px] pb-[160px]">
            <SessionHeader
              title={sessionName}
              createdMs={createdMs}
              lastActivityMs={lastActivityMs}
              runCount={traces.length}
              sessionId={sessionId ?? ""}
            />
            <DebuggerTraceList scrollEl={scrollEl} projectId={projectId} sessionId={sessionId} />
          </div>
          <div className="flex flex-1" />
        </div>
      </div>
      {/* Span click → SPAN panel: session view's SessionSpanPanel, now IN-FLOW as
          the row's last flex child (not an overlay). It owns its own visibility,
          open/close animation, and left-edge resizability — opening it pushes the
          scroll container (and the centered article) over to the left. Must be a
          DIRECT child of this row: the panel measures its parentElement to clamp
          resize widths. */}
      <SessionSpanPanel />
      {/* Dropdown "Open trace view" → full trace-view overlay (no navigation). */}
      {traceViewTraceId && <TraceViewSidePanel traceId={traceViewTraceId} onClose={closeTraceView} />}
      {/* New run arrived via realtime → jump-to-bottom pill. Self-dismisses
          when the user scrolls (or is pinned) to the bottom themselves. */}
      <NewTracePill onScrollToBottom={scrollToBottom} scrollEl={scrollEl} />
    </div>
  );
}
