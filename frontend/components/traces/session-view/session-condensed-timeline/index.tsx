"use client";

import { isEmpty } from "lodash";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import CondensedTimelineElement, {
  ROW_HEIGHT,
} from "@/components/traces/trace-view/condensed-timeline/condensed-timeline-element";
import Controls from "@/components/traces/trace-view/condensed-timeline/controls";
import SelectionIndicator from "@/components/traces/trace-view/condensed-timeline/selection-indicator";
import SelectionOverlay from "@/components/traces/trace-view/condensed-timeline/selection-overlay";
import SubagentGroupElement from "@/components/traces/trace-view/condensed-timeline/subagent-group-element";
import {
  formatTimeMarkerLabel,
  useDynamicTimeIntervals,
} from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { useHoverNeedle } from "@/components/traces/trace-view/condensed-timeline/use-hover-needle";
import { useScrollToSpan } from "@/components/traces/trace-view/condensed-timeline/use-scroll-to-span";
import { useWheelZoom } from "@/components/traces/trace-view/condensed-timeline/use-wheel-zoom";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_INCREMENT } from "@/components/traces/trace-view/store";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import {
  computeSubagentGroups,
  computeVisibleSpanIds,
  transformSpansToCondensedTimeline,
} from "@/components/traces/trace-view/store/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useSessionViewBaseStore } from "../store";
import CloseButton from "./close-button";

const EMPTY_SET = new Set<string>();

interface SessionCondensedTimelineProps {
  trace: TraceRow;
  /** Whether this trace's spans are being fetched (drives the skeleton). Passed in
   *  rather than read from the store: the loading flag (traceSpansFetching) lives on
   *  the debugger store, which this base-dir component intentionally doesn't import. */
  isLoading: boolean;
}

/** Per-trace condensed timeline for the (debugger) session panel. Reuses the
 *  store-free trace-view leaves, but sources all state from the session base
 *  store keyed by `trace.id` instead of one global trace. */
function SessionCondensedTimeline({ trace, isLoading }: SessionCondensedTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const {
    spans,
    zoom,
    visibleSpanIds,
    selectedSpan,
    setSelectedSpan,
    mode,
    transcriptExpandedGroups,
    scrollStartTime,
    scrollEndTime,
    isCostHeatmapVisible,
    setCondensedTimelineZoom,
    setCondensedTimelineVisibleSpanIds,
    clearCondensedTimelineSelection,
    setIsCostHeatmapVisible,
    setTimelineOpen,
    requestScrollToGroup,
  } = useSessionViewBaseStore(
    (s) => ({
      spans: s.traceSpans[trace.id],
      zoom: s.condensedTimelineZoomByTrace[trace.id] ?? MIN_ZOOM,
      visibleSpanIds: s.condensedTimelineVisibleSpanIdsByTrace[trace.id] ?? EMPTY_SET,
      selectedSpan: s.selectedSpan,
      setSelectedSpan: s.setSelectedSpan,
      mode: s.traceViewModes[trace.id] ?? "transcript",
      transcriptExpandedGroups: s.transcriptExpandedGroups,
      scrollStartTime: s.scrollStartTime,
      scrollEndTime: s.scrollEndTime,
      isCostHeatmapVisible: s.isCostHeatmapVisible,
      setCondensedTimelineZoom: s.setCondensedTimelineZoom,
      setCondensedTimelineVisibleSpanIds: s.setCondensedTimelineVisibleSpanIds,
      clearCondensedTimelineSelection: s.clearCondensedTimelineSelection,
      setIsCostHeatmapVisible: s.setIsCostHeatmapVisible,
      setTimelineOpen: s.setTimelineOpen,
      requestScrollToGroup: s.requestScrollToGroup,
    }),
    shallow
  );

  const spanList = useMemo(() => spans ?? [], [spans]);

  const {
    spans: condensedSpans,
    startTime: spanTimelineStartMs,
    totalDurationMs,
    timelineWidthInMilliseconds,
    totalRows,
  } = useMemo(() => transformSpansToCondensedTimeline(spanList), [spanList]);

  const maxSpanCost = useMemo(() => spanList.reduce((m, s) => Math.max(m, s.totalCost), 0), [spanList]);

  const subagentGroups = useMemo(() => computeSubagentGroups(spanList), [spanList]);

  // Resolve the session-scoped selection to a span of THIS trace.
  const selectedSpanForThisTrace = useMemo<TraceViewSpan | undefined>(
    () =>
      selectedSpan && selectedSpan.traceId === trace.id
        ? spanList.find((s) => s.spanId === selectedSpan.spanId)
        : undefined,
    [selectedSpan, trace.id, spanList]
  );

  const groupBoxes = useMemo(() => {
    if (subagentGroups.length === 0) return [];
    const posById = new Map(condensedSpans.map((c) => [c.span.spanId, c]));
    const boxes: Array<{
      groupId: string;
      left: number;
      width: number;
      topRow: number;
      rowSpan: number;
      collapsed: boolean;
    }> = [];
    for (const group of subagentGroups) {
      let minLeft = Infinity;
      let maxRight = -Infinity;
      let minRow = Infinity;
      let maxRow = -Infinity;
      for (const spanId of group.spanIds) {
        const pos = posById.get(spanId);
        if (!pos) continue;
        if (pos.left < minLeft) minLeft = pos.left;
        if (pos.left + pos.width > maxRight) maxRight = pos.left + pos.width;
        if (pos.row < minRow) minRow = pos.row;
        if (pos.row > maxRow) maxRow = pos.row;
      }
      if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight)) continue;
      boxes.push({
        groupId: group.groupId,
        left: minLeft,
        width: maxRight - minLeft,
        topRow: minRow,
        rowSpan: maxRow - minRow + 1,
        collapsed: mode === "tree" ? false : !transcriptExpandedGroups.has(`${trace.id}::${group.groupId}`),
      });
    }
    return boxes;
  }, [subagentGroups, condensedSpans, transcriptExpandedGroups, mode, trace.id]);

  const { markers: timeMarkers, setContainerRef } = useDynamicTimeIntervals({ totalDurationMs, zoom });

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

  useScrollToSpan(scrollRef, selectedSpanForThisTrace, condensedSpans);

  const setZoom = useCallback(
    (z: number) => setCondensedTimelineZoom(trace.id, z),
    [setCondensedTimelineZoom, trace.id]
  );

  useWheelZoom(scrollRef, zoom, setZoom);

  const handleZoom = useCallback(
    (direction: "in" | "out") => {
      const container = scrollRef.current;
      if (!container) return;

      const newZoom = direction === "in" ? zoom + ZOOM_INCREMENT : zoom - ZOOM_INCREMENT;
      if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;

      const containerWidth = container.clientWidth;
      const centerX = container.scrollLeft + containerWidth / 2;
      const fraction = centerX / container.scrollWidth;

      setZoom(newZoom);

      requestAnimationFrame(() => {
        const newScrollWidth = container.scrollWidth;
        const newScrollLeft = fraction * newScrollWidth - containerWidth / 2;
        container.scrollLeft = Math.max(0, Math.min(newScrollLeft, newScrollWidth - containerWidth));
      });
    },
    [zoom, setZoom]
  );

  const handleSelectionComplete = useCallback(
    (selectedIds: Set<string>) => {
      setCondensedTimelineVisibleSpanIds(trace.id, computeVisibleSpanIds(selectedIds, spanList));
    },
    [spanList, setCondensedTimelineVisibleSpanIds, trace.id]
  );

  const handleSpanClick = useCallback(
    (span: TraceViewSpan) => {
      if (!span.pending) setSelectedSpan({ traceId: trace.id, spanId: span.spanId });
    },
    [setSelectedSpan, trace.id]
  );

  const contentHeight = (totalRows + 1) * ROW_HEIGHT;

  const scrollIndicator = useMemo(() => {
    if (scrollStartTime === undefined || scrollEndTime === undefined || timelineWidthInMilliseconds <= 0) return null;
    const rawLeft = ((scrollStartTime - spanTimelineStartMs) / timelineWidthInMilliseconds) * 100;
    const rawWidth = ((scrollEndTime - scrollStartTime) / timelineWidthInMilliseconds) * 100;
    const left = Math.max(0, Math.min(100, rawLeft));
    const width = Math.max(0, Math.min(100 - left, rawWidth));
    if (width <= 0) return null;
    return { left, width };
  }, [scrollStartTime, scrollEndTime, spanTimelineStartMs, timelineWidthInMilliseconds]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-2 py-2 w-full h-full">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-full w-full" />
        </div>
      );
    }

    if (isEmpty(condensedSpans)) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No spans found</div>
      );
    }

    return (
      <div className="relative h-full" style={{ width: `${100 * zoom}%`, minHeight: contentHeight }}>
        {/* Time marker lines - full height */}
        {timeMarkers.map((marker, index) => (
          <div
            key={`marker-${index}`}
            className="absolute top-0 bottom-[-60px] w-px pointer-events-none bg-muted"
            style={{ left: `${marker.positionPercent}%` }}
          />
        ))}

        {/* Scroll indicator */}
        {scrollIndicator && (
          <div
            className="absolute bottom-[-60px] top-0 bg-muted/75 pointer-events-none"
            style={{ left: `${scrollIndicator.left}%`, width: `${scrollIndicator.width}%` }}
          />
        )}

        {/* Sticky header - time marker labels */}
        <div
          className={cn(
            "sticky top-0 z-30 h-6 text-xs pointer-events-none select-none",
            isScrolled && "bg-gradient-to-b from-[hsla(240,4%,9%,90%)] via-[hsla(240,4%,9%,80%)] to-transparent"
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
          {condensedSpans.map((condensedSpan) => {
            const hasGroupSelection = visibleSpanIds.size > 0;
            const isIncludedInGroupSelection = hasGroupSelection ? visibleSpanIds.has(condensedSpan.span.spanId) : null;

            return (
              <CondensedTimelineElement
                key={condensedSpan.span.spanId}
                condensedSpan={condensedSpan}
                selectedSpan={selectedSpanForThisTrace}
                isIncludedInGroupSelection={isIncludedInGroupSelection}
                maxSpanCost={maxSpanCost}
                isCostHeatmapVisible={isCostHeatmapVisible}
                onClick={handleSpanClick}
              />
            );
          })}

          {groupBoxes.map((box) => (
            <SubagentGroupElement
              key={box.groupId}
              groupId={box.groupId}
              left={box.left}
              width={box.width}
              topRow={box.topRow}
              rowSpan={box.rowSpan}
              collapsed={box.collapsed}
              onRequestScroll={(groupId) => requestScrollToGroup(trace.id, groupId)}
            />
          ))}

          <SelectionOverlay
            spans={condensedSpans}
            containerRef={timelineContentRef}
            scrollContainerRef={scrollRef}
            onSelectionComplete={handleSelectionComplete}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative flex flex-col h-[90px] w-full overflow-hidden border-t"
      onClick={(e) => e.stopPropagation()}
    >
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

      <SelectionIndicator selectedCount={selectedCount} onClear={() => clearCondensedTimelineSelection(trace.id)} />

      <Controls
        onZoomIn={() => handleZoom("in")}
        onZoomOut={() => handleZoom("out")}
        zoom={zoom}
        isCostHeatmapVisible={isCostHeatmapVisible}
        onToggleCostHeatmap={setIsCostHeatmapVisible}
      />

      <CloseButton onClose={() => setTimelineOpen(trace.id, false)} />
    </div>
  );
}

export default memo(SessionCondensedTimeline);
