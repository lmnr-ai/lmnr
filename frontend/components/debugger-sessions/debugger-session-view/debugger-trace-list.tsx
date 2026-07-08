"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useSessionSpanPreviews } from "@/components/traces/session-view/session-panel/use-session-span-previews";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";

import NoteContent from "./note-content";
import { computeScoreDeltas, EvaluationCard } from "./session-evaluations";
import { textAnchorId } from "./session-outline/utils";
import { type SessionBlockView, useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "./store";
import TraceBlockCell from "./trace-block-cell";
import { useBlockScrollSync } from "./use-block-scroll-sync";

interface DebuggerTraceListProps {
  scrollEl: HTMLElement | null;
  projectId?: string;
  sessionId?: string;
}

// A block paired with its 1-based trace index (trace blocks only) for "run N of M".
type TimelineItem = { block: SessionBlockView; traceIndex: number };

const withTraceIndex = (blocks: SessionBlockView[]): TimelineItem[] => {
  let traceIndex = 0;
  return blocks.map((block) => ({ block, traceIndex: block.type === "trace" ? ++traceIndex : 0 }));
};

// Generous overscan keeps sticky headers / lazy rows warm beyond the viewport.
const BLOCK_OVERSCAN = 8;

export default function DebuggerTraceList({ scrollEl, projectId, sessionId }: DebuggerTraceListProps) {
  const blocks = useDebuggerSessionViewStore((s) => s.blocks);
  const traceRowStates = useDebuggerSessionViewStore((s) => s.traceRowStates);
  const storeApi = useDebuggerSessionViewStoreRaw();
  const { traces, traceSpans } = useSessionViewBaseStore(
    (s) => ({ traces: s.traces, traceSpans: s.traceSpans }),
    shallow
  );

  const tracesById = useMemo(() => new Map(traces.map((t) => [t.id, t])), [traces]);

  // Bump on any column height change so each segment re-measures its scrollMargin.
  const columnRef = useRef<HTMLDivElement>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setLayoutVersion((v) => v + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Segments report visible span ids; aggregate them for the batched preview fetch.
  const [visibleAgg, setVisibleAgg] = useState<Record<string, { visible: string[]; inputs: string[] }>>({});
  const reportVisibleSpans = useCallback((traceId: string, visible: string[], inputs: string[]) => {
    setVisibleAgg((prev) => {
      const cur = prev[traceId];
      if (cur && cur.visible.join(",") === visible.join(",") && cur.inputs.join(",") === inputs.join(",")) return prev;
      if (!cur && visible.length === 0 && inputs.length === 0) return prev;
      return { ...prev, [traceId]: { visible, inputs } };
    });
  }, []);

  // Filter consumed maps by live ids so a dropped run doesn't keep fetching previews.
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

  const traceIds = useMemo(() => traces.map((t) => t.id), [traces]);
  const { previews: traceIO } = useBatchedTraceIO(projectId, traceIds);

  const items = useMemo(() => withTraceIndex(blocks), [blocks]);

  // Denominator must match traceIndex's source (blocks, not loaded rows).
  const totalTraces = useMemo(() => blocks.reduce((n, b) => n + (b.type === "trace" ? 1 : 0), 0), [blocks]);

  const scoreDeltasById = useMemo(
    () => computeScoreDeltas(blocks.flatMap((b) => (b.type === "evaluation" ? [b.evaluation] : []))),
    [blocks]
  );

  // Outer block virtualizer, offset into the shared scroll element via scrollMargin.
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
    if (block.type === "text") return 180;
    if (block.type === "evaluation") return 200;
    return 250; // collapsed trace card; expanded traces self-measure.
  }, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: estimateBlockSize,
    overscan: BLOCK_OVERSCAN,
    scrollMargin,
    getItemKey: (index) => itemsRef.current[index]?.block.id ?? index,
    // Shared scroll element may already be scrolled on attach — don't yank to top.
    initialOffset: () => scrollEl?.scrollTop ?? 0,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useBlockScrollSync({ scrollEl, columnRef, virtualizer, items, storeApi });

  // Lazily load trace rows for blocks in the virtual window (store dedupes/batches),
  // and bound in-memory span bodies: the visible trace ids are "protected" from
  // eviction so an on-screen trace is never dropped.
  const windowSignature = virtualItems.map((vi) => vi.index).join(",");
  useEffect(() => {
    const ids: string[] = [];
    for (const vi of virtualItems) {
      const block = items[vi.index]?.block;
      if (block?.type === "trace") ids.push(block.traceId);
    }
    if (ids.length > 0) storeApi.getState().ensureTraceRows(ids);
    storeApi.getState().enforceLoadedTraceBound(new Set(ids));
    // windowSignature stands in for `virtualItems`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSignature, items, storeApi]);

  // Normal-flow spacers, not absolute+transform: sticky headers break under transform.
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
                  createdAt={block.createdAt}
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
