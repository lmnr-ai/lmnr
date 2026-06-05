"use client";

import { AlertTriangle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import SessionSpanPanel from "@/components/traces/session-view/session-span-panel";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { useToast } from "@/lib/hooks/use-toast";
import { type RealtimeSpan } from "@/lib/traces/types";

import DebuggerTraceList from "./debugger-trace-list";
import NewTracePill from "./new-trace-pill";
import SessionHeader from "./session-header";
import SessionOutline from "./session-outline";
import { useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "./store";

// How close to the bottom counts as "pinned" for stick-to-bottom. Must exceed
// the article column's 160px bottom padding — stopping where the last trace
// ends still counts as "at the bottom" — while staying small enough that a
// deliberate scroll-up unpins.
const PIN_SLACK_PX = 200;

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

// Page scroll container with a sticky left outline, a 720px article column, and
// a right spacer; span clicks open the in-flow SessionSpanPanel.
export default function DebuggerSessionViewContent({ sessionId }: { sessionId?: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const storeApi = useDebuggerSessionViewStoreRaw();

  const { traces, spanPanelOpen, isTracesLoading, tracesError } = useSessionViewBaseStore(
    (s) => ({
      traces: s.traces,
      spanPanelOpen: s.spanPanelOpen,
      isTracesLoading: s.isTracesLoading,
      tracesError: s.tracesError,
    }),
    shallow
  );

  const sessionName = useDebuggerSessionViewStore((s) => s.sessionName);

  // The page-owned scroll container — the virtualizer (DebuggerTraceList) binds
  // to it and the outline shares the same scroll context.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

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
    // Starts unpinned and only a real scroll event can pin — there is no initial
    // measure on purpose. On load the content is still short ("at the bottom" is
    // trivially true), and an initial pin would drag the viewport down as traces
    // stream in. Scrolling to the bottom (incl. the pill's smooth scroll) pins.
    const pinned = { current: false };
    const measure = () => {
      pinned.current = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - PIN_SLACK_PX;
    };
    scrollEl.addEventListener("scroll", measure, { passive: true });
    const content = scrollEl.firstElementChild;
    const observer = new ResizeObserver(() => {
      // Instant (not smooth) — growth can come every frame while streaming and
      // queued smooth scrolls would rubber-band.
      // `behavior: "instant"` overrides the container's `scroll-smooth` CSS —
      // a smooth snap animates through positions outside the slack, whose
      // scroll events would unpin us mid-flight and kill the follow.
      if (pinned.current) scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "instant" });
    });
    if (content) observer.observe(content);
    return () => {
      scrollEl.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [scrollEl]);

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
        storeApi.getState().applyRealtimeSpans(payload.spans as RealtimeSpan[]);
      },
      trace_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload.traces)) return;
        storeApi
          .getState()
          .applyTraceUpdates(payload.traces as { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }[]);
      },
      // Session renamed (PATCH /v1/.../rollouts/{id}/name) → update the title live.
      // Payload is `{sessionId, name}` (camelCase, see app-server rollouts.rs::update_name).
      session_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { sessionId?: string; name?: string };
        if (payload.sessionId === sessionId && typeof payload.name === "string") {
          storeApi.getState().setSessionName(payload.name);
        }
      },
      // Session deleted (DELETE /v1/.../rollouts/{id}) → toast + bounce to the list.
      // Payload is `{session_id}` (snake_case, see app-server rollouts.rs::delete).
      // The channel is per-session, so any session_deleted here is for THIS session.
      session_deleted: (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { session_id?: string };
        if (sessionId && payload.session_id && payload.session_id !== sessionId) return;
        toast({ variant: "destructive", title: "Session deleted" });
        router.push(`/project/${projectId}/debugger-sessions`);
      },
    }),
    [storeApi, sessionId, projectId, router, toast]
  );

  useRealtime({
    key: `rollout_session_${sessionId}`,
    projectId: projectId as string,
    enabled: !!sessionId && !!projectId,
    eventHandlers,
  });

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <div ref={setScrollEl} className="thin-scrollbar min-h-0 min-w-0 flex-1 scroll-smooth overflow-y-auto">
        <div className="mx-auto flex w-full gap-16 px-6">
          <div className="flex grow-1 justify-center shrink-0 basis-0 min-w-fit">
            {!spanPanelOpen && (
              <div className="sticky top-0 hidden h-[calc(100vh-80px)] w-[220px] flex-none shrink-0 self-start pb-16 pt-[180px] lg:flex">
                <SessionOutline className="max-h-full w-full" />
              </div>
            )}
          </div>
          <div className="min-w-0 w-[720px] pb-[160px]">
            <SessionHeader
              title={sessionName}
              createdMs={createdMs}
              lastActivityMs={lastActivityMs}
              runCount={traces.length}
              sessionId={sessionId ?? ""}
            />
            {/* Same error → loading → content branching as the regular session
                view (session-panel/index.tsx); fetchSessionTraces owns the flags. */}
            {tracesError ? (
              <div className="flex flex-col items-center p-8 text-center">
                <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
                <h3 className="mb-2 text-lg font-semibold text-destructive">Error Loading Session</h3>
                <p className="text-sm text-muted-foreground">{tracesError}</p>
              </div>
            ) : isTracesLoading && traces.length === 0 ? (
              <div className="flex flex-col gap-2 py-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <DebuggerTraceList scrollEl={scrollEl} projectId={projectId} sessionId={sessionId} />
            )}
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
      {/* New run arrived via realtime → jump-to-bottom pill. Self-dismisses
          when the user scrolls (or is pinned) to the bottom themselves. */}
      <NewTracePill onScrollToBottom={scrollToBottom} scrollEl={scrollEl} />
    </div>
  );
}
