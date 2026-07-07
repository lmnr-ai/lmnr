"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useSessionSpanPreviews } from "@/components/traces/session-view/session-panel/use-session-span-previews";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { formatDuration } from "@/lib/utils";

import NoteContent from "./note-content";
import { computeScoreDeltas, EvaluationCard } from "./session-evaluations";
import { textAnchorId } from "./session-outline/utils";
import { type SessionBlockView, useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "./store";
import TraceSegment, { type TraceSegmentProps } from "./trace-segment";

interface DebuggerTraceListProps {
  // The page-owned scroll container (shared with the outline and all segments).
  scrollEl: HTMLElement | null;
  projectId?: string;
  // Debug session id — interpolated into the LLM-span "Copy prompt" payload.
  sessionId?: string;
}

// A block paired with the running trace index (1-based, trace blocks only) so
// each TraceSegment can render its "run N of M" chrome.
type TimelineItem = { block: SessionBlockView; traceIndex: number };

const withTraceIndex = (blocks: SessionBlockView[]): TimelineItem[] => {
  let traceIndex = 0;
  return blocks.map((block) => ({ block, traceIndex: block.type === "trace" ? ++traceIndex : 0 }));
};

// Generous overscan (user-requested): keeps sticky headers / lazy rows warm
// well beyond the viewport so fast scrolls rarely hit skeletons.
const BLOCK_OVERSCAN = 8;
// The "active" block (outline highlight) is the last block whose top sits above
// this fraction of the viewport height from the top.
const ACTIVE_BAND_RATIO = 0.15;

export default function DebuggerTraceList({ scrollEl, projectId, sessionId }: DebuggerTraceListProps) {
  // Blocks are the ordered timeline; traces/traceSpans hold the per-run data
  // that streams over realtime and feeds preview / IO batching.
  const blocks = useDebuggerSessionViewStore((s) => s.blocks);
  const traceRowStates = useDebuggerSessionViewStore((s) => s.traceRowStates);
  const storeApi = useDebuggerSessionViewStoreRaw();
  const { traces, traceSpans } = useSessionViewBaseStore(
    (s) => ({ traces: s.traces, traceSpans: s.traceSpans }),
    shallow
  );

  const tracesById = useMemo(() => new Map(traces.map((t) => [t.id, t])), [traces]);

  // --- Layout version: bumped whenever the column's height changes (expand,
  // collapse, streaming, measurement settle) so every segment re-measures its
  // scrollMargin. Segments guard with a ±1px compare, so this converges.
  // ResizeObserver-driven scrollMargin re-measure is TanStack's documented
  // approach for multiple virtualizers in one scrolling element:
  // https://tanstack.com/virtual/latest/docs/api/virtualizer#scrollmargin ---
  const columnRef = useRef<HTMLDivElement>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setLayoutVersion((v) => v + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Preview fetching: segments report their visible span ids; we aggregate
  // and feed the same batched fetchers the flat list used. ---
  const [visibleAgg, setVisibleAgg] = useState<Record<string, { visible: string[]; inputs: string[] }>>({});
  const reportVisibleSpans = useCallback((traceId: string, visible: string[], inputs: string[]) => {
    setVisibleAgg((prev) => {
      const cur = prev[traceId];
      if (cur && cur.visible.join(",") === visible.join(",") && cur.inputs.join(",") === inputs.join(",")) return prev;
      if (!cur && visible.length === 0 && inputs.length === 0) return prev;
      return { ...prev, [traceId]: { visible, inputs } };
    });
  }, []);

  // Live trace-id set. A wholesale `setTraces` replace can drop ids while leaving a
  // stale visibleAgg entry behind, which would keep fetching previews for a
  // no-longer-displayed run (finding #5). Filter the CONSUMED maps by live ids
  // rather than pruning state in an effect (avoids a setState-in-effect cascade);
  // visibleAgg re-fills when an id returns.
  const liveTraceIds = useMemo(() => new Set(traces.map((t) => t.id)), [traces]);

  const { visibleSpanIdsByTrace, inputSpanIdsByTrace } = useMemo(() => {
    const visible: Record<string, string[]> = {};
    const inputs: Record<string, string[]> = {};
    for (const [traceId, entry] of Object.entries(visibleAgg)) {
      if (!liveTraceIds.has(traceId)) continue;
      if (entry.visible.length > 0) visible[traceId] = entry.visible;
      if (entry.inputs.length > 0) inputs[traceId] = entry.inputs;
    }
    return { visibleSpanIdsByTrace: visible, inputSpanIdsByTrace: inputs };
  }, [visibleAgg, liveTraceIds]);

  const spanTypesByTrace = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const [tid, spans] of Object.entries(traceSpans)) {
      const types: Record<string, string> = {};
      for (const s of spans) types[s.spanId] = s.spanType;
      out[tid] = types;
    }
    return out;
  }, [traceSpans]);

  const previewTraces = useMemo(
    () => traces.map((t) => ({ id: t.id, startTime: t.startTime, endTime: t.endTime })),
    [traces]
  );

  const { previews, userInputs, agentNames } = useSessionSpanPreviews({
    projectId,
    traces: previewTraces,
    visibleSpanIdsByTrace,
    inputSpanIdsByTrace,
    spanTypesByTrace,
  });

  // Only LOADED rows (lazy) — IO batching is naturally bounded by the window.
  const traceIds = useMemo(() => traces.map((t) => t.id), [traces]);
  const { previews: traceIO } = useBatchedTraceIO(projectId, traceIds);

  const items = useMemo(() => withTraceIndex(blocks), [blocks]);

  // Denominator MUST match `traceIndex`'s source (trace blocks), not `traces.length`
  // (loaded rows) — a block whose row isn't loaded still consumes an index, so
  // mixing the two sources produces "run 3 of 2".
  const totalTraces = useMemo(() => blocks.reduce((n, b) => n + (b.type === "trace" ? 1 : 0), 0), [blocks]);

  // Score deltas across evaluation blocks in timeline order, keyed by eval id.
  const scoreDeltasById = useMemo(
    () => computeScoreDeltas(blocks.flatMap((b) => (b.type === "evaluation" ? [b.evaluation] : []))),
    [blocks]
  );

  // --- Outer block virtualizer, offset into the shared scroll element (same
  // scrollMargin pattern as the inner per-trace span virtualizers). ---
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = columnRef.current;
    if (!el || !scrollEl) return;
    const next = Math.round(el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop);
    setScrollMargin((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
  }, [scrollEl, layoutVersion]);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const estimateBlockSize = useCallback((index: number) => {
    const block = itemsRef.current[index]?.block;
    if (!block) return 220;
    if (block.type === "text") return 90;
    if (block.type === "evaluation") return 140;
    // Collapsed trace card + gap divider; expanded traces self-measure anyway.
    return 300;
  }, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: estimateBlockSize,
    overscan: BLOCK_OVERSCAN,
    scrollMargin,
    getItemKey: (index) => itemsRef.current[index]?.block.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // --- Lazy row loading: request trace rows for blocks in the virtual window
  // (incl. overscan). Store dedupes + debounces + chunks; signature-guarded
  // against effect loops (new items array identity every render). ---
  const windowSignature = virtualItems.map((vi) => vi.index).join(",");
  useEffect(() => {
    const ids: string[] = [];
    for (const vi of virtualItems) {
      const block = items[vi.index]?.block;
      if (block?.type === "trace") ids.push(block.traceId);
    }
    if (ids.length > 0) storeApi.getState().ensureTraceRows(ids);
    // windowSignature stands in for `virtualItems`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSignature, items, storeApi]);

  // --- Active block tracking (drives the outline highlight). Store-driven
  // because virtualized-out rows unmount, so IntersectionObserver can't work.
  // rAF-throttled scroll listener; the band is a fraction of the viewport from
  // the top, and the active block is the last one starting above it. ---
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  useEffect(() => {
    if (!scrollEl) return;
    let rafId: number | null = null;
    const update = () => {
      rafId = null;
      const band = scrollEl.scrollTop + scrollEl.clientHeight * ACTIVE_BAND_RATIO;
      let active: string | null = null;
      // measurementsCache covers ALL indexes (measured or estimated), in order.
      for (const m of virtualizerRef.current.measurementsCache) {
        if (m.start > band) break;
        active = String(m.key);
      }
      storeApi.getState().setActiveBlockId(active);
    };
    const onScroll = () => {
      if (rafId === null) rafId = requestAnimationFrame(update);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [scrollEl, storeApi]);

  // --- Outline navigation: scroll to a requested block. Landing rows mount and
  // re-measure (estimates → real heights), shifting the target's offset — so we
  // re-issue scrollToIndex each frame until the offset holds steady for a few
  // consecutive frames. Stability doesn't count while any trace row is still
  // "loading": the debounced lazy batch fetch lands hundreds of ms after the
  // jump and swaps skeletons for taller real cards, shifting every offset below.
  // The frame budget covers that whole window; user wheel/touch input aborts
  // immediately — never fight a manual scroll. ---
  const scrollToBlockId = useDebuggerSessionViewStore((s) => s.scrollToBlockId);
  useEffect(() => {
    if (!scrollToBlockId || !scrollEl) return;
    const idx = items.findIndex(({ block }) => block.id === scrollToBlockId);
    if (idx === -1) {
      storeApi.getState().consumeScrollToBlock();
      return;
    }
    const prevBehavior = scrollEl.style.scrollBehavior;
    scrollEl.style.scrollBehavior = "auto";
    const MAX_FRAMES = 180;
    const STABLE_FRAMES = 5;
    let frames = 0;
    let stable = 0;
    let lastOffset: number | null = null;
    let rafId: number | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      scrollEl.removeEventListener("wheel", finish);
      scrollEl.removeEventListener("touchmove", finish);
      scrollEl.style.scrollBehavior = prevBehavior;
      storeApi.getState().consumeScrollToBlock();
    };
    const step = () => {
      const v = virtualizerRef.current;
      const offset = v.getOffsetForIndex(idx, "start")?.[0] ?? null;
      if (offset !== null && offset === lastOffset) {
        const rowsLoading = Object.values(storeApi.getState().traceRowStates).some((s) => s === "loading");
        stable = rowsLoading ? 0 : stable + 1;
      } else {
        stable = 0;
        if (offset !== null) v.scrollToIndex(idx, { align: "start" });
      }
      lastOffset = offset;
      frames += 1;
      if (stable >= STABLE_FRAMES || frames >= MAX_FRAMES) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(step);
    };
    scrollEl.addEventListener("wheel", finish, { passive: true });
    scrollEl.addEventListener("touchmove", finish, { passive: true });
    virtualizerRef.current.scrollToIndex(idx, { align: "start" });
    rafId = requestAnimationFrame(step);
    return finish;
  }, [scrollToBlockId, items, scrollEl, storeApi]);

  // NORMAL-FLOW spacers instead of absolute+transform: TraceSegment's sticky
  // header breaks inside a transformed ancestor, and the inner virtualizers'
  // scrollMargin math assumes cells sit in document flow.
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start - scrollMargin : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1].end - scrollMargin)
      : 0;

  return (
    <div ref={columnRef} className="w-full">
      {paddingTop > 0 && <div style={{ height: paddingTop }} />}
      {virtualItems.map((virtualRow) => {
        const item = items[virtualRow.index];
        if (!item) return null;
        const { block, traceIndex } = item;
        return (
          <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
            {block.type === "text" ? (
              <div id={textAnchorId(block.id)} className="scroll-mt-4 px-1 py-5">
                <NoteContent content={block.text} />
              </div>
            ) : block.type === "evaluation" ? (
              <div className="py-5">
                <EvaluationCard
                  projectId={projectId ?? ""}
                  evaluation={block.evaluation}
                  scores={scoreDeltasById.get(block.evaluation.id) ?? []}
                />
              </div>
            ) : (
              <TraceBlockCell
                trace={tracesById.get(block.traceId)}
                rowState={traceRowStates[block.traceId]}
                nextBlock={items[virtualRow.index + 1]?.block}
                tracesById={tracesById}
                traceIndex={traceIndex}
                totalTraces={totalTraces}
                scrollEl={scrollEl}
                sessionId={sessionId}
                layoutVersion={layoutVersion}
                reportVisibleSpans={reportVisibleSpans}
                previews={previews}
                userInputs={userInputs}
                agentNames={agentNames}
                traceIO={traceIO[block.traceId]}
              />
            )}
          </div>
        );
      })}
      {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
    </div>
  );
}

type TraceBlockCellProps = Omit<TraceSegmentProps, "trace"> & {
  trace: TraceRow | undefined;
  rowState: "loading" | "loaded" | "missing" | undefined;
  nextBlock: SessionBlockView | undefined;
  tracesById: Map<string, TraceRow>;
};

/**
 * One trace block's cell: skeleton while its row is lazily loading, nothing
 * when the row turned out missing (deleted / not yet in CH — realtime fills
 * the latter in), else the full TraceSegment. The gap divider to the NEXT run
 * lives inside this measured cell; its presence is keyed off the next BLOCK's
 * type (stable from the index) — not the next row's load state — so it can't
 * pop in later and shift measured heights under the scroll position.
 */
const TraceBlockCell = ({ trace, rowState, nextBlock, tracesById, ...segmentProps }: TraceBlockCellProps) => {
  const showDivider = nextBlock?.type === "trace";
  const nextTrace = showDivider ? tracesById.get(nextBlock.traceId) : undefined;

  if (!trace) {
    if (rowState === "missing") return null;
    return (
      <div className="flex flex-col gap-2 py-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Gap duration needs both rows; render the divider without it until the next
  // row loads (divider presence itself never changes).
  const gapMs = nextTrace ? new Date(nextTrace.startTime).getTime() - new Date(trace.endTime).getTime() : undefined;

  return (
    <>
      <TraceSegment trace={trace} {...segmentProps} />
      {showDivider && (
        <div className="px-2 flex h-20 items-center justify-center">
          <div className="w-full border-b" />
          {formatDuration(gapMs) && (
            <span className="shrink-0 px-2 text-xs text-muted-foreground">{formatDuration(gapMs)}</span>
          )}
          <div className="w-full border-b" />
        </div>
      )}
    </>
  );
};
