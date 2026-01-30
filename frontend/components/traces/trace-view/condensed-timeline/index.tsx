import { isEmpty } from "lodash";
import { Minus, Plus } from "lucide-react";
import React, { memo, useCallback, useMemo, useRef } from "react";

import { MAX_ZOOM, MIN_ZOOM, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store";
import { computeVisibleSpanIds } from "@/components/traces/trace-view/trace-view-store-utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import CondensedTimelineElement, { ROW_HEIGHT } from "./condensed-timeline-element";
import SelectionBar from "./selection-bar";
import SelectionOverlay from "./selection-overlay";

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
    timeIntervals,
    totalRows,
  } = useMemo(() => getCondensedTimelineData(), [getCondensedTimelineData, storeSpans]);

  // Calculate selected span count (excluding ancestors)
  const selectedCount = useMemo(() => {
    if (condensedTimelineVisibleSpanIds.size === 0) return 0;
    // Count only non-ancestor spans (spans that were actually selected)
    return condensedSpans.filter(
      (cs) =>
        condensedTimelineVisibleSpanIds.has(cs.span.spanId) &&
        !condensedSpans.some(
          (other) =>
            other.span.spanId !== cs.span.spanId &&
            condensedTimelineVisibleSpanIds.has(other.span.spanId) &&
            other.parentSpanId === cs.span.spanId
        )
    ).length;
  }, [condensedTimelineVisibleSpanIds, condensedSpans]);

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

  const contentHeight = (totalRows + 1) * ROW_HEIGHT;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      {/* Zoom controls - fixed position */}
      <div className="absolute top-0 right-0 z-40 flex items-center gap-1 px-1 h-6 bg-muted/50 border-b border-l rounded-bl">
        <Button
          disabled={condensedTimelineZoom === MAX_ZOOM}
          className="size-4 min-w-4"
          variant="ghost"
          size="icon"
          onClick={() => setCondensedTimelineZoom("in")}
        >
          <Plus className="w-3 h-3" />
        </Button>
        <Button
          disabled={condensedTimelineZoom === MIN_ZOOM}
          className="size-4 min-w-4"
          variant="ghost"
          size="icon"
          onClick={() => setCondensedTimelineZoom("out")}
        >
          <Minus className="w-3 h-3" />
        </Button>
      </div>

      {/* Scrollable timeline area */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative styled-scrollbar min-h-0 bg-muted/50">
        {/* Time interval header - sticky, inside scroll container */}
        <div
          className="sticky top-0 z-30 bg-muted/50 flex text-xs border-b h-6"
          style={{ width: `${100 * condensedTimelineZoom}%` }}
        >
          <div className="flex w-full relative">
            {timeIntervals.map((interval, index) => (
              <div className="flex items-center h-full w-[10%]" key={index}>
                <div className="border-l border-secondary-foreground/20 h-full" />
                <div className="text-secondary-foreground truncate flex ml-1 justify-center text-[10px]">
                  {interval}
                </div>
              </div>
            ))}
            <div className="flex items-center h-full">
              <div className="border-r border-secondary-foreground/20 h-full" />
            </div>
          </div>
        </div>

        {/* Timeline content */}
        <div
          ref={timelineContentRef}
          className="relative"
          style={{ height: contentHeight, width: `${100 * condensedTimelineZoom}%` }}
        >
          {/* Span elements */}
          {condensedSpans.map((condensedSpan) => (
            <CondensedTimelineElement
              key={condensedSpan.span.spanId}
              condensedSpan={condensedSpan}
              selectedSpan={selectedSpan}
              onClick={handleSpanClick}
            />
          ))}

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

      {/* Selection bar */}
      <SelectionBar
        selectedCount={condensedTimelineVisibleSpanIds.size > 0 ? selectedCount : 0}
        onClear={clearCondensedTimelineSelection}
      />
    </div>
  );
}

export default memo(CondensedTimeline);
