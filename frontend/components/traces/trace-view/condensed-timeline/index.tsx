import { isEmpty } from "lodash";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store";
import { computeVisibleSpanIds } from "@/components/traces/trace-view/trace-view-store-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import CondensedTimelineElement, { ROW_HEIGHT } from "./condensed-timeline-element";
import SelectionIndicator from "./selection-indicator";
import SelectionOverlay from "./selection-overlay";
import { formatTimeMarkerLabel, useDynamicTimeIntervals } from "./use-dynamic-time-intervals";
import { useHoverNeedle } from "./use-hover-needle";
import { useScrollToSpan } from "./use-scroll-to-span";
import { useWheelZoom } from "./use-wheel-zoom";
import ZoomControls from "./zoom-controls";

const HEADER_HEIGHT = 24; // h-6 = 1.5rem = 24px

function CondensedTimeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const {
    getCondensedTimelineData,
    spans: storeSpans,
    selectedSpan,
    setSelectedSpan,
    selectSpanById,
    isSpansLoading,
    condensedTimelineVisibleSpanIds,
    setCondensedTimelineVisibleSpanIds,
    clearCondensedTimelineSelection,
    condensedTimelineZoom,
    setCondensedTimelineZoom,
  } = useTraceViewStoreContext((state) => ({
    getCondensedTimelineData: state.getCondensedTimelineData,
    spans: state.spans,
    selectedSpan: state.selectedSpan,
    setSelectedSpan: state.setSelectedSpan,
    selectSpanById: state.selectSpanById,
    isSpansLoading: state.isSpansLoading,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    setCondensedTimelineVisibleSpanIds: state.setCondensedTimelineVisibleSpanIds,
    clearCondensedTimelineSelection: state.clearCondensedTimelineSelection,
    condensedTimelineZoom: state.condensedTimelineZoom,
    setCondensedTimelineZoom: state.setCondensedTimelineZoom,
  }));

  const {
    spans: condensedSpans,
    totalDurationMs,
    totalRows,
  } = useMemo(() => getCondensedTimelineData(), [getCondensedTimelineData, storeSpans]);

  // Compute dynamic time markers based on container width and zoom
  const { markers: timeMarkers, setContainerRef } = useDynamicTimeIntervals({
    totalDurationMs,
    zoom: condensedTimelineZoom,
  });

  // Callback ref to connect scrollRef with resize observer
  const combinedScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      setContainerRef(node);
    },
    [setContainerRef]
  );

  // Track if container is scrolled (for sticky header background)
  const [isScrolled, setIsScrolled] = useState(false);

  const selectedCount = condensedTimelineVisibleSpanIds.size;

  // Hover needle tracking
  const { needleLeft, hoverTimeMs, handleMouseMove, handleMouseLeave } = useHoverNeedle(scrollRef, totalDurationMs);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setIsScrolled(target.scrollTop > 0);
  }, []);

  // Auto-scroll to selected span
  useScrollToSpan(scrollRef, selectedSpan, condensedSpans);

  // Cmd/Ctrl + scroll to zoom
  useWheelZoom(scrollRef, condensedTimelineZoom, setCondensedTimelineZoom);

  const handleSingleClick = useCallback(
    (spanId: string) => {
      selectSpanById(spanId);
    },
    [selectSpanById]
  );

  const handleSelectionComplete = useCallback(
    (selectedIds: Set<string>) => {
      const visibleIds = computeVisibleSpanIds(selectedIds, storeSpans);
      setCondensedTimelineVisibleSpanIds(visibleIds);
    },
    [storeSpans, setCondensedTimelineVisibleSpanIds]
  );

  const handleSpanClick = useCallback(
    (span: (typeof storeSpans)[0]) => {
      if (!span.pending) {
        setSelectedSpan(span);
      }
    },
    [setSelectedSpan]
  );

  const contentHeight = (totalRows + 1) * ROW_HEIGHT;
  const totalHeight = HEADER_HEIGHT + contentHeight;

  // Render loading and empty states inside the ref'd element to ensure hooks work correctly
  const renderContent = () => {
    if (isSpansLoading) {
      return (
        <div className="flex flex-col gap-2 p-2 w-full h-full">
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
      <>
        {/* Inner container with zoom width */}
        <div className="relative h-full" style={{ width: `${100 * condensedTimelineZoom}%`, minHeight: totalHeight }}>
          {/* Time marker lines - full height including header */}
          {timeMarkers.map((marker, index) => (
            <div
              key={`marker-${index}`}
              className="absolute top-0 bottom-0 w-px pointer-events-none bg-muted"
              style={{ left: `${marker.positionPercent}%` }}
            />
          ))}

          {/* Time interval header - sticky */}
          <div
            className={cn(
              "sticky top-0 z-30 text-xs h-6 pointer-events-none select-none overflow-visible",
              isScrolled && "bg-gradient-to-b from-[hsla(240,4%,9%,90%)] via-[hsla(240,4%,9%,80%)] to-transparent"
            )}
          >
            <div className="w-full h-full relative">
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
          </div>

          {/* Timeline content */}
          <div ref={timelineContentRef} className="relative h-full" style={{ minHeight: contentHeight }}>
            {/* Span elements */}
            {condensedSpans.map((condensedSpan) => {
              const hasGroupSelection = condensedTimelineVisibleSpanIds.size > 0;
              const isIncludedInGroupSelection = hasGroupSelection
                ? condensedTimelineVisibleSpanIds.has(condensedSpan.span.spanId)
                : null;

              return (
                <CondensedTimelineElement
                  key={condensedSpan.span.spanId}
                  condensedSpan={condensedSpan}
                  selectedSpan={selectedSpan}
                  isIncludedInGroupSelection={isIncludedInGroupSelection}
                  onClick={handleSpanClick}
                />
              );
            })}

            {/* Selection overlay */}
            <SelectionOverlay
              spans={condensedSpans}
              containerRef={timelineContentRef}
              scrollContainerRef={scrollRef}
              onSingleClick={handleSingleClick}
              onSelectionComplete={handleSelectionComplete}
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      {/* Scrollable timeline area - ALWAYS rendered so refs are attached */}
      <div
        ref={combinedScrollRef}
        className="flex-1 overflow-auto relative scrollbar scrollbar-w-1 scrollbar-h-1 scrollbar-thumb-white/15 scrollbar-thumb-rounded-full min-h-0 bg-muted/50 h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onScroll={handleScroll}
      >
        {renderContent()}
      </div>

      {/* Hover Needle - outside scroll, z-35 (below SelectionIndicator z-40) */}
      {needleLeft !== null && (
        <div className="absolute inset-y-0 pointer-events-none z-[35]" style={{ left: `${needleLeft}%` }}>
          {/* Head */}
          <div className="absolute top-0 h-6 flex items-center -translate-x-1/2">
            <div className="px-1.5 py-0.5 bg-primary text-white text-[10px] rounded whitespace-nowrap">
              {hoverTimeMs !== null ? formatTimeMarkerLabel(Math.round(hoverTimeMs)) : ""}
            </div>
          </div>
          {/* Line */}
          <div className="absolute top-[6px] bottom-0 w-px bg-primary/50" />
        </div>
      )}

      {/* Selection indicator */}
      <SelectionIndicator selectedCount={selectedCount} onClear={clearCondensedTimelineSelection} />

      {/* Zoom controls */}
      <ZoomControls />
    </div>
  );
}

export default memo(CondensedTimeline);
