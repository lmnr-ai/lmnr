import { isEmpty } from "lodash";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import {
  formatTimeMarkerLabel,
  useDynamicTimeIntervals,
} from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { useHoverNeedle } from "@/components/traces/trace-view/condensed-timeline/use-hover-needle";
import { useWheelZoom } from "@/components/traces/trace-view/condensed-timeline/use-wheel-zoom";
import { type TraceViewSpan } from "@/components/traces/trace-view/store";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { type TraceSignalInfo, useUltimateTraceViewStore } from "../store";
import SelectionIndicator from "./selection-indicator";
import SelectionOverlay from "./selection-overlay";
import SpanNodeRenderer from "./span-node-renderer";
import TimelineElement, { ROW_HEIGHT } from "./timeline-element";
import { computeSubtreeRowRanges } from "./timeline-utils";
import ZoomControls from "./zoom-controls";

const emptySet = new Set<string>();
const emptyMap = new Map<string, number>();
const emptySpanSignalMap = new Map<string, string[]>();
const emptyBlockSummaries: Record<string, never> = {};

interface TimelineProps {
  traceId: string;
}

function Timeline({ traceId }: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const zoom = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.zoom ?? 1);
  const isSpansLoading = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.isSpansLoading ?? false);
  const visibleSpanIds = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.visibleSpanIds ?? emptySet);
  const spans = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.spans);
  const spanTree = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.spanTree ?? null);
  const maxDepth = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.maxDepth ?? 0);
  const granularityDepth = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.granularityDepth ?? 0);
  const expandedRowMap = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.expandedRowMap ?? emptyMap);
  const totalRows = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.totalRows ?? 0);
  const blockSummaries = useUltimateTraceViewStore(
    (state) => state.traces.get(traceId)?.blockSummaries ?? emptyBlockSummaries
  );
  const getCondensedTimelineData = useUltimateTraceViewStore((state) => state.getCondensedTimelineData);
  const selectSpan = useUltimateTraceViewStore((state) => state.selectSpan);
  const selectedSpanId = useUltimateTraceViewStore((state) => state.selectedSpanId);
  const selectedTraceId = useUltimateTraceViewStore((state) => state.selectedTraceId);
  const setSelectedSpanIds = useUltimateTraceViewStore((state) => state.setSelectedSpanIds);
  const clearSelectedSpanIds = useUltimateTraceViewStore((state) => state.clearSelectedSpanIds);
  const setZoom = useUltimateTraceViewStore((state) => state.setZoom);
  const openSpanViewPanel = useUltimateTraceViewStore((state) => state.openSpanViewPanel);
  const openSpanListPanel = useUltimateTraceViewStore((state) => state.openSpanListPanel);
  const signals = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.signals ?? []);
  const spanSignalMap = useUltimateTraceViewStore(
    (state) => state.traces.get(traceId)?.spanSignalMap ?? emptySpanSignalMap
  );
  const openEventPayloadPanel = useUltimateTraceViewStore((state) => state.openEventPayloadPanel);

  // At max depth, use original condensed timeline rendering
  const isAtMaxDepth = granularityDepth >= maxDepth;

  const { spans: condensedSpans, totalDurationMs } = useMemo(
    () => getCondensedTimelineData(traceId),
    [getCondensedTimelineData, traceId, spans]
  );

  // Compute trace start time for span-node-renderer
  const traceState = useUltimateTraceViewStore((state) => state.traces.get(traceId));
  const traceStartMs = useMemo(() => {
    if (!traceState?.trace) return 0;
    return new Date(traceState.trace.startTime).getTime();
  }, [traceState?.trace]);

  // Pre-compute subtree row ranges for overlay positioning
  const subtreeRowRanges = useMemo(
    () => (spanTree ? computeSubtreeRowRanges(spanTree, expandedRowMap) : new Map()),
    [spanTree, expandedRowMap]
  );

  const { markers: timeMarkers, setContainerRef } = useDynamicTimeIntervals({
    totalDurationMs,
    zoom,
  });

  const combinedScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      setContainerRef(node);
    },
    [setContainerRef]
  );

  const [isScrolled, setIsScrolled] = useState(false);
  const selectedCount = visibleSpanIds.size;

  const { needleLeft, hoverTimeMs, handleMouseMove, handleMouseLeave } = useHoverNeedle(scrollRef, totalDurationMs);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 0);
  }, []);

  const handleSetZoom = useCallback((z: number) => setZoom(traceId, z), [setZoom, traceId]);
  useWheelZoom(scrollRef, zoom, handleSetZoom);

  const handleSelectionComplete = useCallback(
    (selectedIds: Set<string>) => {
      setSelectedSpanIds(traceId, selectedIds);
      // Open span list panel with selected spans
      openSpanListPanel(traceId, Array.from(selectedIds), "Selection");
    },
    [traceId, setSelectedSpanIds, openSpanListPanel]
  );

  const handleClearSelection = useCallback(() => {
    clearSelectedSpanIds(traceId);
  }, [traceId, clearSelectedSpanIds]);

  // At max granularity, clicking a span bar opens span view directly
  const handleSpanClick = useCallback(
    (span: TraceViewSpan) => {
      if (span.pending) return;
      selectSpan(traceId, span.spanId);
      openSpanViewPanel(traceId, span.spanId);
    },
    [selectSpan, traceId, openSpanViewPanel]
  );

  // For span-node-renderer: click by spanId
  // isCondensed = true means a block was clicked, open span list
  // isCondensed = false means a single span was clicked, open span view
  const handleNodeSpanClick = useCallback(
    (spanId: string, isCondensed: boolean) => {
      selectSpan(traceId, spanId);
      if (isCondensed) {
        // Block clicked: collect all descendant span IDs and open span list
        const collectDescendantIds = (nodeSpanId: string): string[] => {
          const ids: string[] = [nodeSpanId];
          const children = (spans ?? []).filter((s) => s.parentSpanId === nodeSpanId);
          for (const child of children) {
            ids.push(...collectDescendantIds(child.spanId));
          }
          return ids;
        };
        const blockSpanIds = collectDescendantIds(spanId);
        setSelectedSpanIds(traceId, new Set(blockSpanIds));
        openSpanListPanel(traceId, blockSpanIds, "Block Spans");
      } else {
        openSpanViewPanel(traceId, spanId);
      }
    },
    [selectSpan, traceId, spans, setSelectedSpanIds, openSpanListPanel, openSpanViewPanel]
  );

  // Build a lookup from signalId to TraceSignalInfo
  const signalById = useMemo(() => {
    const map = new Map<string, TraceSignalInfo>();
    for (const s of signals) {
      map.set(s.signalId, s);
    }
    return map;
  }, [signals]);

  // Get signals for a given spanId
  const getSpanSignals = useCallback(
    (spanId: string): TraceSignalInfo[] => {
      const signalIds = spanSignalMap.get(spanId);
      if (!signalIds) return [];
      return signalIds.map((id) => signalById.get(id)).filter(Boolean) as TraceSignalInfo[];
    },
    [spanSignalMap, signalById]
  );

  const handleSignalDotClick = useCallback(
    (signalId: string) => {
      const signal = signalById.get(signalId);
      if (!signal || signal.events.length === 0) return;
      openEventPayloadPanel(traceId, signalId, signal.events[0]);
    },
    [signalById, traceId, openEventPayloadPanel]
  );

  const activeSelectedSpanId = selectedTraceId === traceId ? selectedSpanId : null;

  const contentHeight = (totalRows + 1) * ROW_HEIGHT;

  const renderContent = () => {
    if (isSpansLoading) {
      return (
        <div className="flex flex-col gap-2 py-2 w-full h-full">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-full w-full min-h-[100px]" />
        </div>
      );
    }

    if (isEmpty(condensedSpans)) {
      return (
        <div className="flex items-center justify-center h-full min-h-[100px] text-sm text-muted-foreground">
          No spans found
        </div>
      );
    }

    return (
      <div className="relative h-full" style={{ width: `${100 * zoom}%`, minHeight: contentHeight }}>
        {/* Time marker lines */}
        {timeMarkers.map((marker, index) => (
          <div
            key={`marker-${index}`}
            className="absolute top-0 bottom-[-60px] w-px pointer-events-none bg-muted"
            style={{ left: `${marker.positionPercent}%` }}
          />
        ))}

        {/* Sticky time header */}
        <div
          className={cn(
            "sticky top-0 z-30 h-6 text-xs pointer-events-none select-none",
            isScrolled && "bg-gradient-to-b from-background/90 via-background/80 to-transparent"
          )}
        >
          {timeMarkers.map((marker, index) => (
            <div
              key={index}
              className="absolute flex items-center h-full"
              style={{ left: `${marker.positionPercent}%` }}
            >
              <div className="text-secondary-foreground truncate text-[10px] whitespace-nowrap pl-1">
                {marker.label}
              </div>
            </div>
          ))}
        </div>

        {/* Timeline content */}
        <div ref={timelineContentRef} className="relative h-full" style={{ minHeight: contentHeight }}>
          {isAtMaxDepth
            ? // At max depth: render individual span bars (original behavior)
              condensedSpans.map((condensedSpan) => {
                const hasGroupSelection = visibleSpanIds.size > 0;
                const isIncludedInGroupSelection = hasGroupSelection
                  ? visibleSpanIds.has(condensedSpan.span.spanId)
                  : null;
                const isSelected = selectedTraceId === traceId && selectedSpanId === condensedSpan.span.spanId;

                const spanSigs = getSpanSignals(condensedSpan.span.spanId);
                return (
                  <TimelineElement
                    key={condensedSpan.span.spanId}
                    condensedSpan={condensedSpan}
                    isSelected={isSelected}
                    isIncludedInGroupSelection={isIncludedInGroupSelection}
                    onClick={handleSpanClick}
                    spanSignals={spanSigs.length > 0 ? spanSigs : undefined}
                    onSignalDotClick={handleSignalDotClick}
                  />
                );
              })
            : // At shallower depth: render span tree with condensed overlays
              spanTree?.map((rootNode) => (
                <SpanNodeRenderer
                  key={rootNode.span.spanId}
                  node={rootNode}
                  timelineDepth={granularityDepth}
                  expandedRowMap={expandedRowMap}
                  subtreeRowRanges={subtreeRowRanges}
                  totalDurationMs={totalDurationMs}
                  traceStartMs={traceStartMs}
                  blockSummaries={blockSummaries}
                  selectedSpanId={activeSelectedSpanId}
                  visibleSpanIds={visibleSpanIds}
                  onSpanClick={handleNodeSpanClick}
                  getSpanSignals={getSpanSignals}
                  onSignalDotClick={handleSignalDotClick}
                />
              ))}

          <SelectionOverlay
            spans={condensedSpans}
            containerRef={timelineContentRef}
            onSelectionComplete={handleSelectionComplete}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full overflow-hidden relative flex-1 min-h-0">
      <div
        ref={combinedScrollRef}
        className="flex-1 overflow-auto relative min-h-0 bg-muted/50 h-full minimal-scrollbar"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onScroll={handleScroll}
      >
        <div className="px-2 h-full">{renderContent()}</div>
      </div>

      {/* Hover needle */}
      {needleLeft !== null && (
        <div className="absolute inset-y-0 pointer-events-none z-[35]" style={{ left: `${needleLeft}%` }}>
          <div className="absolute top-0 h-6 flex items-center -translate-x-1/2">
            <div className="px-1.5 py-0.5 bg-primary text-white text-[10px] rounded whitespace-nowrap">
              {hoverTimeMs !== null ? formatTimeMarkerLabel(Math.round(hoverTimeMs)) : ""}
            </div>
          </div>
          <div className="absolute top-[6px] bottom-0 w-px bg-primary/50" />
        </div>
      )}

      <SelectionIndicator selectedCount={selectedCount} onClear={handleClearSelection} />
      <ZoomControls traceId={traceId} />
    </div>
  );
}

export default memo(Timeline);
