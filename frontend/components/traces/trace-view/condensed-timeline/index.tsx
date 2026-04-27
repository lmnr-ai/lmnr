import { PlayIcon } from "@radix-ui/react-icons";
import { isEmpty } from "lodash";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import { MAX_ZOOM, MIN_ZOOM, ZOOM_INCREMENT } from "@/components/traces/trace-view/store";
import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { computeVisibleSpanIds } from "@/components/traces/trace-view/store/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import CondensedTimelineElement, { ROW_HEIGHT } from "./condensed-timeline-element";
import Controls from "./controls";
import SelectionIndicator from "./selection-indicator";
import SelectionOverlay from "./selection-overlay";
import SubagentGroupElement from "./subagent-group-element";
import { formatTimeMarkerLabel, useDynamicTimeIntervals } from "./use-dynamic-time-intervals";
import { useHoverNeedle } from "./use-hover-needle";
import { useScrollToSpan } from "./use-scroll-to-span";
import { useWheelZoom } from "./use-wheel-zoom";

function CondensedTimeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const {
    getCondensedTimelineData,
    getCondensedSubagentGroups,
    spans: storeSpans,
    selectedSpan,
    setSelectedSpan,
    isSpansLoading,
    condensedTimelineVisibleSpanIds,
    setCondensedTimelineVisibleSpanIds,
    clearCondensedTimelineSelection,
    condensedTimelineZoom,
    setCondensedTimelineZoom,
    selectMaxSpanCost,
    sessionTime,
    sessionStartTime,
    browserSession,
    scrollStartTime,
    scrollEndTime,
    transcriptExpandedGroups,
    requestScrollToGroup,
    tab,
  } = useTraceViewBaseStore((state) => ({
    getCondensedTimelineData: state.getCondensedTimelineData,
    getCondensedSubagentGroups: state.getCondensedSubagentGroups,
    spans: state.spans,
    selectedSpan: state.selectedSpan,
    setSelectedSpan: state.setSelectedSpan,
    isSpansLoading: state.isSpansLoading,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    setCondensedTimelineVisibleSpanIds: state.setCondensedTimelineVisibleSpanIds,
    clearCondensedTimelineSelection: state.clearCondensedTimelineSelection,
    condensedTimelineZoom: state.condensedTimelineZoom,
    setCondensedTimelineZoom: state.setCondensedTimelineZoom,
    selectMaxSpanCost: state.selectMaxSpanCost,
    sessionTime: state.sessionTime,
    sessionStartTime: state.sessionStartTime,
    browserSession: state.browserSession,
    scrollStartTime: state.scrollStartTime,
    scrollEndTime: state.scrollEndTime,
    transcriptExpandedGroups: state.transcriptExpandedGroups,
    requestScrollToGroup: state.requestScrollToGroup,
    tab: state.tab,
  }));

  const {
    spans: condensedSpans,
    startTime: spanTimelineStartMs,
    totalDurationMs,
    timelineWidthInMilliseconds,
    totalRows,
  } = useMemo(() => getCondensedTimelineData(), [getCondensedTimelineData, storeSpans]);

  const maxSpanCost = useMemo(() => selectMaxSpanCost(), [selectMaxSpanCost, storeSpans]);

  // Subagent groups — reuses the transcript's grouping logic and collapsed state
  // so toggling a group header in the transcript flips its wrapper in the
  // timeline too. Bounding boxes come from the already-computed condensed
  // layout (no separate position math).
  const subagentGroups = useMemo(() => getCondensedSubagentGroups(), [getCondensedSubagentGroups, storeSpans]);

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
        collapsed: tab === "tree" ? false : !transcriptExpandedGroups.has(group.groupId),
      });
    }
    return boxes;
  }, [subagentGroups, condensedSpans, transcriptExpandedGroups, tab]);

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

  const handleZoom = useCallback(
    (direction: "in" | "out") => {
      const container = scrollRef.current;
      if (!container) return;

      const newZoom =
        direction === "in" ? condensedTimelineZoom + ZOOM_INCREMENT : condensedTimelineZoom - ZOOM_INCREMENT;
      if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;

      const containerWidth = container.clientWidth;
      const centerX = container.scrollLeft + containerWidth / 2;
      const fraction = centerX / container.scrollWidth;

      setCondensedTimelineZoom(newZoom);

      requestAnimationFrame(() => {
        const newScrollWidth = container.scrollWidth;
        const newScrollLeft = fraction * newScrollWidth - containerWidth / 2;
        container.scrollLeft = Math.max(0, Math.min(newScrollLeft, newScrollWidth - containerWidth));
      });
    },
    [condensedTimelineZoom, setCondensedTimelineZoom]
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

  const scrollIndicator = useMemo(() => {
    if (scrollStartTime === undefined || scrollEndTime === undefined || timelineWidthInMilliseconds <= 0) return null;
    const rawLeft = ((scrollStartTime - spanTimelineStartMs) / timelineWidthInMilliseconds) * 100;
    const rawWidth = ((scrollEndTime - scrollStartTime) / timelineWidthInMilliseconds) * 100;
    const left = Math.max(0, Math.min(100, rawLeft));
    const width = Math.max(0, Math.min(100 - left, rawWidth));
    if (width <= 0) return null;
    return { left, width };
  }, [scrollStartTime, scrollEndTime, spanTimelineStartMs, timelineWidthInMilliseconds]);

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
              style={{
                left: `${((sessionTime * 1000 + (sessionStartTime ?? spanTimelineStartMs) - spanTimelineStartMs) / totalDurationMs) * 100}%`,
              }}
            >
              <div className="absolute top-0 h-6 flex items-center -translate-x-1/2 z-[34]">
                <div className="size-5 bg-landing-text-500 text-primary-foreground rounded-full flex items-center justify-center">
                  <PlayIcon className="w-3 h-3" />
                </div>
              </div>
              <div className="absolute top-[6px] bottom-[-60px] w-px bg-landing-text-500" />
            </div>
          )}

          {/* Time marker lines - full height */}
          {timeMarkers.map((marker, index) => (
            <div
              key={`marker-${index}`}
              className="absolute top-0 bottom-[-60px] w-px pointer-events-none bg-muted"
              style={{ left: `${marker.positionPercent}%` }}
            />
          ))}

          {/* Scroll indicator — highlights the time range covered by rows currently
              visible in the transcript/tree virtualizer */}
          {scrollIndicator && (
            <div
              className="absolute bottom-[-60px] top-0 bg-muted/75 pointer-events-none"
              style={{ left: `${scrollIndicator.left}%`, width: `${scrollIndicator.width}%` }}
            />
          )}

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
                  maxSpanCost={maxSpanCost}
                  onClick={handleSpanClick}
                />
              );
            })}

            {/* Subagent group wrappers — collapsed = solid fill, click scrolls
                the transcript to the group header. Expanded = outline only,
                pointer-events-none so spans underneath stay interactive. */}
            {groupBoxes.map((box) => (
              <SubagentGroupElement
                key={box.groupId}
                groupId={box.groupId}
                left={box.left}
                width={box.width}
                topRow={box.topRow}
                rowSpan={box.rowSpan}
                collapsed={box.collapsed}
                onRequestScroll={requestScrollToGroup}
              />
            ))}

            {/* Selection overlay - only handles drag selection, clicks go to span elements */}
            <SelectionOverlay
              spans={condensedSpans}
              containerRef={timelineContentRef}
              scrollContainerRef={scrollRef}
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
      <Controls onZoomIn={() => handleZoom("in")} onZoomOut={() => handleZoom("out")} />
    </div>
  );
}

export default memo(CondensedTimeline);
