"use client";

import { defaultRangeExtractor, type Range, useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import TraceCollapsedBody from "@/components/traces/session-view/session-panel/trace-collapsed-body";
import TraceItem from "@/components/traces/session-view/session-panel/trace-item";
import { useSessionSpanPreviews } from "@/components/traces/session-view/session-panel/use-session-span-previews";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { type TraceIOEntry, useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";
import {
  AgentGroupHeader,
  GroupChildWrapper,
  InputItem,
  SpanItem,
} from "@/components/traces/trace-view/transcript/item";
import { SpanCard } from "@/components/traces/trace-view/tree/span-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/lib/utils";

import CopyFlag from "../copy-flag";
import { computeScoreDeltas } from "../session-evaluations";
import { traceAnchorId } from "../session-outline/utils";
import { useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "../store";
import { useBlockScrollSync } from "../use-block-scroll-sync";
import { useScrollMargin } from "../use-scroll-margin";
import EvaluationBlockItem from "./evaluation-block-item";
import {
  buildDebuggerFlatRows,
  type DebuggerFlatRow,
  flatRowEstimate,
  flatRowKey,
  spanFlagProps,
  withTraceIndex,
} from "./flat-rows";
import TextBlockItem from "./text-block-item";

interface DebuggerListProps {
  scrollEl: HTMLElement | null;
  projectId?: string;
  sessionId: string;
}

const ROW_OVERSCAN = 16;
// Approximate collapsed-header height; scroll-to-group lands groups below it.
const STICKY_HEADER_HEIGHT = 44;

export default function DebuggerList({ scrollEl, projectId, sessionId }: DebuggerListProps) {
  const storeApi = useDebuggerSessionViewStoreRaw();

  const blocks = useDebuggerSessionViewStore((s) => s.blocks);
  const traceRowStates = useDebuggerSessionViewStore((s) => s.traceRowStates);
  const traceSpansFetching = useDebuggerSessionViewStore((s) => s.traceSpansFetching);

  const {
    traces,
    traceSpans,
    traceSpansError,
    expandedTraceIds,
    transcriptExpandedGroups,
    traceViewModes,
    traceShowTreeContent,
    selectedSpan,
    toggleTraceExpanded,
    toggleTranscriptGroup,
    toggleSpanCollapse,
    setSelectedSpan,
    scrollToGroup,
    consumeScrollToGroup,
    scrollToTraceId,
    consumeScrollToTrace,
  } = useSessionViewBaseStore(
    (s) => ({
      traces: s.traces,
      traceSpans: s.traceSpans,
      traceSpansError: s.traceSpansError,
      expandedTraceIds: s.expandedTraceIds,
      transcriptExpandedGroups: s.transcriptExpandedGroups,
      traceViewModes: s.traceViewModes,
      traceShowTreeContent: s.traceShowTreeContent,
      selectedSpan: s.selectedSpan,
      toggleTraceExpanded: s.toggleTraceExpanded,
      toggleTranscriptGroup: s.toggleTranscriptGroup,
      toggleSpanCollapse: s.toggleSpanCollapse,
      setSelectedSpan: s.setSelectedSpan,
      scrollToGroup: s.scrollToGroup,
      consumeScrollToGroup: s.consumeScrollToGroup,
      scrollToTraceId: s.scrollToTraceId,
      consumeScrollToTrace: s.consumeScrollToTrace,
    }),
    shallow
  );

  const tracesById = useMemo(() => new Map(traces.map((t) => [t.id, t])), [traces]);
  const items = useMemo(() => withTraceIndex(blocks), [blocks]);
  const totalTraces = useMemo(() => blocks.reduce((n, b) => n + (b.type === "trace" ? 1 : 0), 0), [blocks]);

  const scoreDeltasById = useMemo(
    () => computeScoreDeltas(blocks.flatMap((b) => (b.type === "evaluation" ? [b.evaluation] : []))),
    [blocks]
  );

  const flatRows = useMemo(
    () =>
      buildDebuggerFlatRows({
        items,
        tracesById,
        traceRowStates,
        traceSpans,
        traceSpansFetching,
        traceSpansError,
        expandedTraceIds,
        transcriptExpandedGroups,
        traceViewModes,
      }),
    [
      items,
      tracesById,
      traceRowStates,
      traceSpans,
      traceSpansFetching,
      traceSpansError,
      expandedTraceIds,
      transcriptExpandedGroups,
      traceViewModes,
    ]
  );

  const columnRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useScrollMargin(columnRef, scrollEl);

  // Instant programmatic scroll. The default scrollToFn goes through `scrollTo`,
  // which the container's CSS `scroll-smooth` would animate — janky against the
  // virtualizer's per-measurement offset corrections (it re-invokes scrollToFn as
  // rows measure). Writing scrollTop directly bypasses CSS scroll-behavior, so
  // each correction is an instant re-snap, not a fighting animation.
  const scrollToFn = useCallback(
    (offset: number, opts: { adjustments?: number }, instance: Virtualizer<HTMLElement, Element>) => {
      const el = instance.scrollElement;
      if (el) el.scrollTop = offset + (opts.adjustments ?? 0);
    },
    []
  );

  // Which trace-header index (if any) each row belongs to — the header stays
  // pinned only over its own trace's rows, releasing on eval/text/divider rows.
  const headerIndexByRow = useMemo(() => {
    const byRow = new Array<number>(flatRows.length).fill(-1);
    let current = -1;
    flatRows.forEach((row, idx) => {
      if (row.type === "trace-header") {
        current = idx;
        byRow[idx] = idx;
      } else if (
        row.type === "trace-collapsed-body" ||
        row.type === "trace-loading" ||
        row.type === "trace-error" ||
        row.type === "trace-empty" ||
        row.type === "user-input" ||
        row.type === "span" ||
        row.type === "group-header" ||
        row.type === "group-span" ||
        row.type === "tree-span"
      ) {
        byRow[idx] = current;
      } else {
        current = -1;
      }
    });
    return byRow;
  }, [flatRows]);

  const activeStickyIndexRef = useRef<number | null>(null);
  const isActiveSticky = useCallback((index: number) => activeStickyIndexRef.current === index, []);

  const rangeExtractor = useCallback(
    (range: Range) => {
      const header = headerIndexByRow[range.startIndex];
      activeStickyIndexRef.current = header !== undefined && header >= 0 ? header : null;
      if (activeStickyIndexRef.current === null) return defaultRangeExtractor(range);
      const next = new Set([activeStickyIndexRef.current, ...defaultRangeExtractor(range)]);
      return [...next].sort((a, b) => a - b);
    },
    [headerIndexByRow]
  );

  const flatRowsRef = useRef(flatRows);
  flatRowsRef.current = flatRows;
  const traceShowTreeContentRef = useRef(traceShowTreeContent);
  traceShowTreeContentRef.current = traceShowTreeContent;

  const getItemKey = useCallback((index: number) => {
    const row = flatRowsRef.current[index];
    return row ? flatRowKey(row) : index;
  }, []);

  const estimateSize = useCallback((index: number) => {
    const row = flatRowsRef.current[index];
    if (!row) return 70;
    const showTreeContent = "traceId" in row ? traceShowTreeContentRef.current[row.traceId] !== false : true;
    return flatRowEstimate(row, showTreeContent);
  }, []);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollEl,
    estimateSize,
    overscan: ROW_OVERSCAN,
    scrollMargin,
    rangeExtractor,
    getItemKey,
    scrollToFn,
    // Shared scroll element may already be scrolled on attach — don't yank to top.
    initialOffset: () => scrollEl?.scrollTop ?? 0,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // First flat-row index per block id — the outline scroll target.
  const blockFirstIndex = useMemo(() => {
    const map = new Map<string, number>();
    flatRows.forEach((row, idx) => {
      if (!map.has(row.blockId)) map.set(row.blockId, idx);
    });
    return map;
  }, [flatRows]);

  useBlockScrollSync({ scrollEl, virtualizer, flatRows, blockFirstIndex, storeApi });

  // Lazily request trace rows for blocks in the window (store dedupes/batches) and
  // bound in-memory span bodies — visible trace ids are protected from eviction.
  const windowSignature = virtualItems.map((vi) => vi.index).join(",");
  useEffect(() => {
    const ids = new Set<string>();
    for (const vi of virtualItems) {
      const row = flatRows[vi.index];
      if (row && "traceId" in row) ids.add(row.traceId);
    }
    if (ids.size > 0) storeApi.getState().ensureTraceRows([...ids]);
    storeApi.getState().enforceLoadedTraceBound(ids);
    // windowSignature stands in for `virtualItems`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSignature, flatRows, storeApi]);

  // --- Preview + trace-IO fetching driven by the visible window ---
  const rangeStart = virtualItems[0]?.index ?? 0;
  const rangeEnd = virtualItems[virtualItems.length - 1]?.index ?? -1;

  const { visibleSpanIdsByTrace, inputSpanIdsByTrace } = useMemo(() => {
    const visible: Record<string, string[]> = {};
    const inputs: Record<string, string[]> = {};
    const push = (map: Record<string, string[]>, traceId: string, spanId: string) => {
      if (!map[traceId]) map[traceId] = [];
      if (!map[traceId].includes(spanId)) map[traceId].push(spanId);
    };
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const row = flatRows[i];
      if (!row) continue;
      if (row.type === "span" || row.type === "group-span" || row.type === "tree-span") {
        push(visible, row.traceId, row.span.spanId);
      } else if (row.type === "group-header") {
        if (row.group.firstLlmSpanId) {
          push(visible, row.traceId, row.group.firstLlmSpanId);
          push(inputs, row.traceId, row.group.firstLlmSpanId);
        }
        if (row.collapsed && row.group.lastLlmSpanId) push(visible, row.traceId, row.group.lastLlmSpanId);
      }
    }
    return { visibleSpanIdsByTrace: visible, inputSpanIdsByTrace: inputs };
  }, [rangeStart, rangeEnd, flatRows]);

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

  // Scroll selected span (once per selection) to center.
  const lastScrolledSpanIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedSpan) {
      lastScrolledSpanIdRef.current = null;
      return;
    }
    if (lastScrolledSpanIdRef.current === selectedSpan.spanId) return;
    const idx = flatRows.findIndex(
      (r) =>
        (r.type === "span" || r.type === "group-span" || r.type === "tree-span") &&
        r.traceId === selectedSpan.traceId &&
        r.span.spanId === selectedSpan.spanId
    );
    if (idx === -1) return;
    lastScrolledSpanIdRef.current = selectedSpan.spanId;
    const rafId = requestAnimationFrame(() => virtualizer.scrollToIndex(idx, { align: "center" }));
    return () => cancelAnimationFrame(rafId);
  }, [selectedSpan, flatRows, virtualizer]);

  // Scroll a subagent group's header into view (condensed-timeline click), landing
  // below the sticky header. Two passes so estimated offsets settle after measure.
  useEffect(() => {
    if (!scrollToGroup) return;
    const idx = flatRows.findIndex(
      (r) =>
        r.type === "group-header" && r.traceId === scrollToGroup.traceId && r.group.groupId === scrollToGroup.groupId
    );
    if (idx === -1) {
      consumeScrollToGroup();
      return;
    }
    const scrollWithOffset = () => {
      const offset = virtualizer.getOffsetForIndex(idx, "start")?.[0];
      if (offset !== undefined)
        scrollEl?.scrollTo({ top: Math.max(0, offset - STICKY_HEADER_HEIGHT), behavior: "auto" });
    };
    scrollWithOffset();
    const rafId = requestAnimationFrame(() => {
      scrollWithOffset();
      consumeScrollToGroup();
    });
    return () => cancelAnimationFrame(rafId);
  }, [scrollToGroup, flatRows, virtualizer, scrollEl, consumeScrollToGroup]);

  // Bring a just-collapsed trace's header into view (only if out of view).
  useEffect(() => {
    if (!scrollToTraceId) return;
    const idx = flatRows.findIndex((r) => r.type === "trace-header" && r.traceId === scrollToTraceId);
    if (idx === -1) {
      consumeScrollToTrace();
      return;
    }
    virtualizer.scrollToIndex(idx, { align: "auto" });
    const rafId = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(idx, { align: "auto" });
      consumeScrollToTrace();
    });
    return () => cancelAnimationFrame(rafId);
  }, [scrollToTraceId, flatRows, virtualizer, consumeScrollToTrace]);

  return (
    <div ref={columnRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualItems.map((virtualRow) => {
        const row = flatRows[virtualRow.index];
        if (!row) return null;

        const activeSticky = isActiveSticky(virtualRow.index);
        const positionStyle: CSSProperties = activeSticky
          ? { position: "sticky", top: 0, zIndex: 100 + virtualRow.index, background: "hsl(var(--background))" }
          : { position: "absolute", top: 0, transform: `translateY(${virtualRow.start - scrollMargin}px)` };

        return (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            style={{ ...positionStyle, left: 0, width: "100%" }}
          >
            <FlatRowContent
              row={row}
              sessionId={sessionId}
              projectId={projectId}
              totalTraces={totalTraces}
              traceIO={traceIO}
              previews={previews}
              userInputs={userInputs}
              agentNames={agentNames}
              traceShowTreeContent={traceShowTreeContent}
              selectedSpanId={selectedSpan?.spanId}
              selectedTraceId={selectedSpan?.traceId}
              scoreDeltasById={scoreDeltasById}
              traceSpansFetching={traceSpansFetching}
              onToggleTrace={toggleTraceExpanded}
              onToggleGroup={toggleTranscriptGroup}
              onToggleSpanCollapse={toggleSpanCollapse}
              onSelectSpan={setSelectedSpan}
            />
          </div>
        );
      })}
    </div>
  );
}

interface FlatRowContentProps {
  row: DebuggerFlatRow;
  sessionId: string;
  projectId?: string;
  totalTraces: number;
  traceIO: Record<string, TraceIOEntry | null | undefined>;
  previews: Record<string, string | null>;
  userInputs: Record<string, string | null>;
  agentNames: Record<string, string | null>;
  traceShowTreeContent: Record<string, boolean>;
  selectedSpanId?: string;
  selectedTraceId?: string;
  scoreDeltasById: ReturnType<typeof computeScoreDeltas>;
  traceSpansFetching: Record<string, boolean>;
  onToggleTrace: (traceId: string) => void;
  onToggleGroup: (traceId: string, groupId: string) => void;
  onToggleSpanCollapse: (traceId: string, spanId: string) => void;
  onSelectSpan: (selection: { traceId: string; spanId: string }) => void;
}

// One flat row's content. Split out so the map body stays readable; the wrapper
// div (position + measurement) is owned by the list.
function FlatRowContent({
  row,
  sessionId,
  projectId,
  totalTraces,
  traceIO,
  previews,
  userInputs,
  agentNames,
  traceShowTreeContent,
  selectedSpanId,
  selectedTraceId,
  scoreDeltasById,
  traceSpansFetching,
  onToggleTrace,
  onToggleGroup,
  onToggleSpanCollapse,
  onSelectSpan,
}: FlatRowContentProps) {
  const isSelected = (traceId: string, spanId: string) => selectedTraceId === traceId && selectedSpanId === spanId;

  switch (row.type) {
    case "text":
      return <TextBlockItem id={row.blockId} text={row.text} />;
    case "evaluation":
      return (
        <EvaluationBlockItem
          projectId={projectId}
          evaluation={row.evaluation}
          scores={scoreDeltasById.get(row.evaluation.id) ?? []}
          createdAt={row.createdAt}
        />
      );
    case "trace-skeleton":
      return (
        <div className="flex flex-col gap-2 py-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    case "trace-header":
      return (
        <div id={traceAnchorId(row.traceId)} className="flex flex-col bg-background">
          <div className="h-2 w-full bg-background" />
          <CopyFlag label="Copy trace ID" toastTitle="Copied trace ID" value={row.traceId}>
            <TraceItem
              trace={row.trace}
              expanded={row.expanded}
              traceIndex={row.traceIndex}
              totalTraces={totalTraces}
              onToggle={() => onToggleTrace(row.traceId)}
              analyticsFeature="debugger_sessions"
              timelineLoading={!!traceSpansFetching[row.traceId]}
            />
          </CopyFlag>
        </div>
      );
    case "trace-collapsed-body":
      return <TraceCollapsedBody trace={row.trace} traceIO={traceIO[row.traceId]} />;
    case "trace-loading":
      return (
        <div className="flex flex-col gap-2 px-2 py-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      );
    case "trace-error":
      return <div className="px-2 py-4 text-sm text-destructive">{row.error}</div>;
    case "trace-empty":
      return <div className="px-2 py-4 text-sm text-muted-foreground">No spans found for this trace.</div>;
    case "user-input":
      return (
        <InputItem
          text={traceIO[row.traceId]?.inputPreview ?? null}
          isLoading={traceIO[row.traceId] === undefined}
          className="rounded-lg"
        />
      );
    case "group-header":
      return (
        <AgentGroupHeader
          group={row.group}
          collapsed={row.collapsed}
          previews={previews}
          inputPreviews={userInputs}
          agentNames={agentNames}
          className="mx-0"
          onToggle={() => onToggleGroup(row.traceId, row.group.groupId)}
        />
      );
    case "group-span":
      return (
        <GroupChildWrapper isLast={row.isLast} className="mx-0">
          <CopyFlag {...spanFlagProps(row.span, row.traceId, sessionId)}>
            <SpanItem
              span={row.span}
              output={previews[row.span.spanId]}
              onSpanSelect={(s) => onSelectSpan({ traceId: row.traceId, spanId: s.spanId })}
              isSelected={isSelected(row.traceId, row.span.spanId)}
              inGroup
            />
          </CopyFlag>
        </GroupChildWrapper>
      );
    case "tree-span":
      return (
        <SpanCard
          span={row.span}
          branchMask={row.branchMask}
          depth={row.depth}
          hasChildren={row.hasChildren}
          output={previews[row.span.spanId]}
          showTreeContent={traceShowTreeContent[row.traceId] ?? true}
          isSelected={isSelected(row.traceId, row.span.spanId)}
          onSpanSelect={(s) => s && onSelectSpan({ traceId: row.traceId, spanId: s.spanId })}
          onToggleCollapse={(spanId) => onToggleSpanCollapse(row.traceId, spanId)}
        />
      );
    case "span":
      return (
        <CopyFlag {...spanFlagProps(row.span, row.traceId, sessionId)}>
          <SpanItem
            span={row.span}
            output={previews[row.span.spanId]}
            onSpanSelect={(s) => onSelectSpan({ traceId: row.traceId, spanId: s.spanId })}
            isSelected={isSelected(row.traceId, row.span.spanId)}
          />
        </CopyFlag>
      );
    case "trace-divider":
      return (
        <div className="flex h-20 items-center justify-center px-2">
          <div className="w-full border-b" />
          {formatDuration(row.gapMs) && (
            <span className="shrink-0 px-2 text-xs text-muted-foreground">{formatDuration(row.gapMs)}</span>
          )}
          <div className="w-full border-b" />
        </div>
      );
  }
}
