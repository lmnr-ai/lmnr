import { isEmpty } from "lodash";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MAX_ZOOM, MIN_ZOOM, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store";
import { computeVisibleSpanIds } from "@/components/traces/trace-view/trace-view-store-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import CondensedTimelineElement, { ROW_HEIGHT } from "./condensed-timeline-element";
import SelectionIndicator from "./selection-indicator";
import SelectionOverlay from "./selection-overlay";
import { formatTimeMarkerLabel, useDynamicTimeIntervals } from "./use-dynamic-time-intervals";

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

  // Combine the callback ref with the scrollRef
  const combinedScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Update the scrollRef for scrolling functionality
      (scrollRef as React.RefObject<HTMLDivElement | null>).current = node;
      // Update the container ref for resize observation
      setContainerRef(node);
    },
    [setContainerRef]
  );

  // Hover needle state - tracks percentage position
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);

  // Track if container is scrolled (for sticky header background)
  const [isScrolled, setIsScrolled] = useState(false);

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const scrollRect = scrollContainer.getBoundingClientRect();
    // Calculate position including scroll offset
    const x = e.clientX - scrollRect.left + scrollContainer.scrollLeft;
    const percent = (x / scrollContainer.scrollWidth) * 100;

    setHoverPercent(Math.max(0, Math.min(100, percent)));
  }, []);

  const handleTimelineMouseLeave = useCallback(() => {
    setHoverPercent(null);
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setIsScrolled(target.scrollTop > 0);
  }, []);

  // Calculate hover time from position
  const hoverTimeMs = hoverPercent !== null ? (hoverPercent / 100) * totalDurationMs : null;

  const selectedCount = condensedTimelineVisibleSpanIds.size;

  // Scroll to selected span when it changes
  useEffect(() => {
    if (!selectedSpan || !scrollRef.current) return;

    // Find the selected span in condensedSpans
    const selectedCondensedSpan = condensedSpans.find((cs) => cs.span.spanId === selectedSpan.spanId);
    if (!selectedCondensedSpan) return;

    // Get container dimensions
    const container = scrollRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const scrollWidth = container.scrollWidth;

    // Calculate horizontal pixel position from percentage
    const spanLeftPx = (selectedCondensedSpan.left / 100) * scrollWidth;
    const spanWidthPx = (selectedCondensedSpan.width / 100) * scrollWidth;

    // Calculate vertical pixel position from row
    const spanTopPx = selectedCondensedSpan.row * ROW_HEIGHT;
    const headerHeight = 24; // h-6 = 1.5rem = 24px

    // Center the span in the view horizontally
    const targetScrollX = spanLeftPx + spanWidthPx / 2 - containerWidth / 2;

    // Center the span in the view vertically (accounting for sticky header)
    const targetScrollY = spanTopPx - containerHeight / 2 + headerHeight;

    container.scrollTo({
      left: Math.max(0, targetScrollX),
      top: Math.max(0, targetScrollY),
      behavior: "smooth",
    });
  }, [selectedSpan, condensedSpans]);

  // Cmd/Ctrl + scroll to zoom (centered on mouse position)
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const handleWheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      e.preventDefault();

      const direction = e.deltaY < 0 ? "in" : e.deltaY > 0 ? "out" : null;
      if (!direction) return;

      // Get current state before zoom
      const oldScrollLeft = scrollContainer.scrollLeft;
      const oldScrollWidth = scrollContainer.scrollWidth;
      const containerWidth = scrollContainer.clientWidth;
      const containerRect = scrollContainer.getBoundingClientRect();

      // Mouse position relative to container
      const mouseX = e.clientX - containerRect.left;

      // Content position under mouse as fraction of total width
      const contentX = oldScrollLeft + mouseX;
      const fraction = contentX / oldScrollWidth;

      // Calculate new zoom (mirrors store logic)
      const ZOOM_INCREMENT = 0.5;
      const newZoom =
        direction === "in"
          ? Math.min(condensedTimelineZoom + ZOOM_INCREMENT, MAX_ZOOM)
          : Math.max(condensedTimelineZoom - ZOOM_INCREMENT, MIN_ZOOM);

      // Don't do anything if zoom didn't change (at limits)
      if (newZoom === condensedTimelineZoom) return;

      // Calculate new scroll width and position
      const zoomRatio = newZoom / condensedTimelineZoom;
      const newScrollWidth = oldScrollWidth * zoomRatio;
      const newScrollLeft = fraction * newScrollWidth - mouseX;

      // Update zoom
      setCondensedTimelineZoom(direction);

      // Adjust scroll position (use requestAnimationFrame to ensure DOM has updated)
      requestAnimationFrame(() => {
        scrollContainer.scrollLeft = Math.max(0, Math.min(newScrollLeft, newScrollWidth - containerWidth));
      });
    };

    // passive: false is required for preventDefault() to work on wheel events
    scrollContainer.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      scrollContainer.removeEventListener("wheel", handleWheel);
    };
  }, [condensedTimelineZoom, setCondensedTimelineZoom]);

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

  if (isSpansLoading) {
    return (
      <div className="flex flex-col gap-2 p-2 w-full h-full">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (isEmpty(condensedSpans)) {
    return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No spans found</div>;
  }

  const headerHeight = 24; // h-6 = 1.5rem = 24px
  const contentHeight = (totalRows + 1) * ROW_HEIGHT;
  const totalHeight = headerHeight + contentHeight;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      {/* Scrollable timeline area */}
      <div
        ref={combinedScrollRef}
        className="flex-1 overflow-auto relative no-scrollbar min-h-0 bg-muted/50 h-full"
        onMouseMove={handleTimelineMouseMove}
        onMouseLeave={handleTimelineMouseLeave}
        onScroll={handleScroll}
      >
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

          {/* Needle line - extends from header through content */}
          {hoverPercent !== null && (
            <div
              className="absolute top-[6px] pointer-events-none w-px bg-primary/50 z-10 h-full"
              style={{ left: `${hoverPercent}%` }}
            />
          )}

          {/* Time interval header - sticky */}
          <div
            className={cn(
              "sticky top-0 z-30 text-xs h-6 pointer-events-none select-none overflow-visible",
              isScrolled && "bg-gradient-to-b from-muted/90 via-muted/80 to-transparent"
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

              {/* Needle head - inside sticky header, above line */}
              {hoverPercent !== null && (
                <div
                  className="absolute top-0 h-full flex items-center pointer-events-none -translate-x-1/2 z-20"
                  style={{ left: `${hoverPercent}%` }}
                >
                  <div className="px-1.5 py-0.5 bg-primary text-white text-[10px] rounded whitespace-nowrap">
                    {hoverTimeMs !== null ? formatTimeMarkerLabel(Math.round(hoverTimeMs)) : ""}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline content */}
          <div
            ref={timelineContentRef}
            className="relative"
            //style={{ minHeight: `max(${contentHeight}px, calc(100% - ${headerHeight}px))` }}
            style={{ minHeight: contentHeight }}
          >
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
      </div>

      {/* Selection indicator */}
      <SelectionIndicator selectedCount={selectedCount} onClear={clearCondensedTimelineSelection} />
    </div>
  );
}

export default memo(CondensedTimeline);
