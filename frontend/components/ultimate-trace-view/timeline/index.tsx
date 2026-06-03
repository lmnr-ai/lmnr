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

import { useUltimateTraceViewStore } from "../store";
import TimelineElement, { ROW_HEIGHT } from "./timeline-element";
import ZoomControls from "./zoom-controls";

interface TimelineProps {
  traceId: string;
}

function Timeline({ traceId }: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const zoom = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.zoom ?? 1);
  const isSpansLoading = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.isSpansLoading ?? false);
  const spans = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.spans);
  const getCondensedTimelineData = useUltimateTraceViewStore((state) => state.getCondensedTimelineData);
  const selectSpan = useUltimateTraceViewStore((state) => state.selectSpan);
  const selectedSpanId = useUltimateTraceViewStore((state) => state.selectedSpanId);
  const selectedTraceId = useUltimateTraceViewStore((state) => state.selectedTraceId);
  const setZoom = useUltimateTraceViewStore((state) => state.setZoom);
  const openSidePanel = useUltimateTraceViewStore((state) => state.openSidePanel);

  // Full-detail layout: one bar per span (row/left/width). No depth condensing.
  const {
    spans: timelineSpans,
    totalRows,
    totalDurationMs,
  } = useMemo(() => getCondensedTimelineData(traceId), [getCondensedTimelineData, traceId, spans]);

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

  const { needleLeft, hoverTimeMs, handleMouseMove, handleMouseLeave } = useHoverNeedle(scrollRef, totalDurationMs);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 0);
  }, []);

  const handleSetZoom = useCallback((z: number) => setZoom(traceId, z), [setZoom, traceId]);
  useWheelZoom(scrollRef, zoom, handleSetZoom);

  // Clicking a span bar selects it and opens the regular trace-view side panel.
  const handleSpanClick = useCallback(
    (span: TraceViewSpan) => {
      if (span.pending) return;
      selectSpan(traceId, span.spanId);
      openSidePanel(traceId, span.spanId);
    },
    [selectSpan, traceId, openSidePanel]
  );

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

    if (isEmpty(timelineSpans)) {
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

        {/* Timeline content: one bar per span (full detail) */}
        <div className="relative h-full" style={{ minHeight: contentHeight }}>
          {timelineSpans.map((condensedSpan) => {
            const isSelected = selectedTraceId === traceId && selectedSpanId === condensedSpan.span.spanId;
            return (
              <TimelineElement
                key={condensedSpan.span.spanId}
                condensedSpan={condensedSpan}
                isSelected={isSelected}
                onClick={handleSpanClick}
              />
            );
          })}
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

      <ZoomControls traceId={traceId} />
    </div>
  );
}

export default memo(Timeline);
