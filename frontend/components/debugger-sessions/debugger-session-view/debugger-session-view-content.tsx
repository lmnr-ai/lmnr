"use client";

import { AlertTriangle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import SessionSpanPanel from "@/components/traces/session-view/session-span-panel";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { type SessionBlock } from "@/lib/actions/debugger-sessions";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeSpan } from "@/lib/traces/types";

import DebuggerList from "./debugger-list";
import NewTracePill from "./new-trace-pill";
import SessionHeader from "./session-header";
import SessionOutline from "./session-outline";
import { type SessionBlockView, useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "./store";
import { useStickToBottom } from "./use-stick-to-bottom";

// Session-level meta derived from the timeline blocks: created = earliest block
// created_at, updated = latest block created_at (blocks are ordered, but min/max
// is robust to a realtime insert landing before a re-sort). Counts are per type.
const summarizeBlocks = (blocks: SessionBlockView[]) => {
  let createdMs: number | undefined;
  let updatedMs: number | undefined;
  let traceCount = 0;
  let evalCount = 0;
  for (const block of blocks) {
    const ms = new Date(block.createdAt).getTime();
    if (!Number.isNaN(ms)) {
      createdMs = createdMs === undefined ? ms : Math.min(createdMs, ms);
      updatedMs = updatedMs === undefined ? ms : Math.max(updatedMs, ms);
    }
    if (block.type === "trace") traceCount += 1;
    else if (block.type === "evaluation") evalCount += 1;
  }
  return { createdMs, updatedMs, traceCount, evalCount };
};

// Page scroll container with a sticky left outline, a 720px article column, and
// a right spacer; span clicks open the in-flow SessionSpanPanel.
export default function DebuggerSessionViewContent({ sessionId }: { sessionId: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const storeApi = useDebuggerSessionViewStoreRaw();

  const { spanPanelOpen, isTracesLoading, tracesError } = useSessionViewBaseStore(
    (s) => ({
      spanPanelOpen: s.spanPanelOpen,
      isTracesLoading: s.isTracesLoading,
      tracesError: s.tracesError,
    }),
    shallow
  );

  const sessionName = useDebuggerSessionViewStore((s) => s.sessionName);
  const blocks = useDebuggerSessionViewStore((s) => s.blocks);

  // The page-owned scroll container — the virtualizer (DebuggerList) binds
  // to it and the outline shares the same scroll context.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  // Eval blocks are pushed at creation with empty scores. When a later block
  // arrives, backfill any still-scoreless eval by refetching once (the eval has
  // usually finished by then). Guarded on isTracesLoading so it can't stack.
  const backfillPendingEvalScores = useCallback(
    (arrivedBlockId?: string) => {
      const state = storeApi.getState();
      if (state.isTracesLoading) return;
      const pending = state.blocks.some(
        (b) => b.type === "evaluation" && b.evaluation.scores.length === 0 && b.id !== arrivedBlockId
      );
      if (pending) void state.fetchSessionBlocks(sessionId);
    },
    [sessionId, storeApi]
  );

  // Stick-to-bottom decisions only start once the initial runs fetch has
  // settled: during loading the page is trivially short, so an "at the bottom"
  // reading taken before history renders would drag an old session's viewport
  // to the bottom.
  const [scrollSettled, setScrollSettled] = useState(false);

  // Initial fetch of the session's runs.
  useEffect(() => {
    void storeApi
      .getState()
      .fetchSessionBlocks(sessionId)
      .finally(() => setScrollSettled(true));
  }, [sessionId, storeApi]);

  // Follow streamed/growing content to the bottom once the initial fetch settles.
  const scrollToBottom = useStickToBottom(scrollEl, { enabled: scrollSettled });

  const { createdMs, updatedMs, traceCount, evalCount } = useMemo(() => summarizeBlocks(blocks), [blocks]);

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
        backfillPendingEvalScores();
      },
      // Note / eval block pushed → upsert it into the timeline.
      block_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { sessionId?: string; block?: SessionBlock };
        if (payload.sessionId !== sessionId || !payload.block) return;
        storeApi.getState().applyBlockUpdate(payload.block);
        backfillPendingEvalScores(payload.block.id);
      },
      // Session renamed (PATCH /v1/.../rollouts/{id}/name) → update the title live.
      // Payload is `{sessionId, name}` (camelCase, see app-server rollouts.rs::update_name).
      session_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { sessionId?: string; name?: string };
        if (payload.sessionId === sessionId && typeof payload.name === "string") {
          storeApi.getState().setSessionName(payload.name);
        }
      },
      // Session deleted → toast + bounce to the list. Payload `{session_id}`
      // (snake_case, see rollouts.rs::delete); the channel is per-session.
      session_deleted: (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { session_id?: string };
        if (payload.session_id && payload.session_id !== sessionId) return;
        toast({ variant: "destructive", title: "Session deleted" });
        router.push(`/project/${projectId}/debugger-sessions`);
      },
    }),
    [storeApi, sessionId, projectId, router, toast, backfillPendingEvalScores]
  );

  useRealtime({
    key: `rollout_session_${sessionId}`,
    projectId: projectId as string,
    enabled: !!projectId,
    eventHandlers,
  });

  return (
    <div className="flex flex-1 min-h-0 w-full">
      {/* overflow-x-hidden + the article's min-w floor: at narrow widths the
          article stops compressing and slides under the span panel's left edge
          instead of crunching its content. */}
      <div
        ref={setScrollEl}
        className="thin-scrollbar min-h-0 min-w-0 flex-1 scroll-smooth overflow-y-auto overflow-x-hidden"
      >
        <div className="mx-auto flex w-full gap-16 px-6">
          <div className="flex grow-1 justify-center shrink-0 basis-0 min-w-fit">
            {!spanPanelOpen && (
              <div className="sticky top-0 hidden h-[calc(100vh-80px)] w-[220px] flex-none shrink-0 self-start pb-16 pt-[180px] lg:flex">
                <SessionOutline className="max-h-full w-full" />
              </div>
            )}
          </div>
          <div className="min-w-[560px] w-[720px] pb-[160px]">
            <SessionHeader
              title={sessionName}
              createdMs={createdMs}
              updatedMs={updatedMs}
              traceCount={traceCount}
              evalCount={evalCount}
              sessionId={sessionId}
            />
            {/* One interleaved timeline of trace / evaluation / text blocks,
                ordered by block created_at, fetched via fetchSessionBlocks and
                streamed live over realtime. Fall back to the skeleton only while
                blocks are still loading into an otherwise-empty session. */}
            {tracesError ? (
              <div className="flex flex-col items-center p-8 text-center">
                <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
                <h3 className="mb-2 text-lg font-semibold text-destructive">Error Loading Session</h3>
                <p className="text-sm text-muted-foreground">{tracesError}</p>
              </div>
            ) : blocks.length > 0 ? (
              <DebuggerList scrollEl={scrollEl} projectId={projectId} sessionId={sessionId} />
            ) : isTracesLoading ? (
              <div className="flex flex-col gap-2 py-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="flex justify-center py-16 text-sm text-muted-foreground">No runs in this session yet</div>
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
