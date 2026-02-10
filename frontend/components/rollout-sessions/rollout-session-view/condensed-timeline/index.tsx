import { PlayIcon } from "@radix-ui/react-icons";
import { isEmpty } from "lodash";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import CondensedTimelineElement, {
  ROW_HEIGHT,
} from "@/components/traces/trace-view/condensed-timeline/condensed-timeline-element";
import SelectionIndicator from "@/components/traces/trace-view/condensed-timeline/selection-indicator";
import SelectionOverlay from "@/components/traces/trace-view/condensed-timeline/selection-overlay";
import {
  formatTimeMarkerLabel,
  useDynamicTimeIntervals,
} from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { useHoverNeedle } from "@/components/traces/trace-view/condensed-timeline/use-hover-needle";
import { useScrollToSpan } from "@/components/traces/trace-view/condensed-timeline/use-scroll-to-span";
import { useWheelZoom } from "@/components/traces/trace-view/condensed-timeline/use-wheel-zoom";
import { computeVisibleSpanIds } from "@/components/traces/trace-view/trace-view-store-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import ZoomControls from "./zoom-controls";

function CondensedTimeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const {
    getCondensedTimelineData,
    spans: storeSpans,
    selectedSpan,
    setSelectedSpan,
    isSpansLoading,
    condensedTimelineVisibleSpanIds,
    setCondensedTimelineVisibleSpanIds,
    clearCondensedTimelineSelection,
    condensedTimelineZoom,
    setCondensedTimelineZoom,
    sessionTime,
    sessionStartTime,
    browserSession,
  } = useRolloutSessionStoreContext((state) => ({
    getCondensedTimelineData: state.getCondensedTimelineData,
    spans: state.spans,
    selectedSpan: state.selectedSpan,
    setSelectedSpan: state.setSelectedSpan,
    isSpansLoading: state.isSpansLoading,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    setCondensedTimelineVisibleSpanIds: state.setCondensedTimelineVisibleSpanIds,
    clearCondensedTimelineSelection: state.clearCondensedTimelineSelection,
    condensedTimelineZoom: state.condensedTimelineZoom,
    setCondensedTimelineZoom: state.setCondensedTimelineZoom,
    sessionTime: state.sessionTime,
    sessionStartTime: state.sessionStartTime,
    browserSession: state.browserSession,
  }));

  const {
    spans: condensedSpans,
    startTime: spanTimelineStartMs,
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
    setIsScrolled(e.currentTarget.scrollTop > 0);
  }, []);

  // Auto-scroll to selected span
  useScrollToSpan(scrollRef, selectedSpan, condensedSpans);

  // Cmd/Ctrl + scroll to zoom
  useWheelZoom(scrollRef, condensedTimelineZoom, setCondensedTimelineZoom);

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

  // Render loading and empty states inside the ref'd element to ensure hooks work correctly
  const renderContent = () => {
    if (isSpansLoading) {
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
      <>
        {/* Inner container with zoom width */}
        <div className="relative h-full" style={{ width: `${100 * condensedTimelineZoom}%`, minHeight: contentHeight }}>
          {/* Session Time Needle */}
          {browserSession && sessionTime !== undefined && totalDurationMs > 0 && (
            <div
              className="absolute inset-y-0 pointer-events-none z-[33]"
              style={{ left: `${((sessionTime * 1000 + (sessionStartTime ?? spanTimelineStartMs) - spanTimelineStartMs) / totalDurationMs) * 100}%` }}
            >
              <div className="absolute top-0 h-6 flex items-center -translate-x-1/2 z-[34]">
                <div className="size-5 bg-landing-text-500 text-primary-foreground rounded-full flex items-center justify-center">
                  <PlayIcon className="w-3 h-3" />
                </div>
              </div>
              <div className="absolute top-[6px] bottom-0 w-px bg-landing-text-500" />
            </div>
          )}

          {/* Time marker lines - full height */}
          {timeMarkers.map((marker, index) => (
            <div
              key={`marker-${index}`}
              className="absolute top-0 bottom-0 w-px pointer-events-none bg-muted"
              style={{ left: `${marker.positionPercent}%` }}
            />
          ))}

          {/* Sticky header - scrolls horizontally with content, sticks vertically */}
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

            {/* Selection overlay - only handles drag selection, clicks go to span elements */}
            <SelectionOverlay
              spans={condensedSpans}
              containerRef={timelineContentRef}
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
        className="flex-1 overflow-auto relative min-h-0 bg-muted/50 h-full minimal-scrollbar"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onScroll={handleScroll}
      >
        <div className="px-2 h-full">{renderContent()}</div>
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
