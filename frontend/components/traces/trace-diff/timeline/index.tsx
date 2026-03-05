"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  formatTimeMarkerLabel,
  useDynamicTimeIntervals,
} from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useTraceDiffStore } from "../trace-diff-store";
import { DIFF_ROW_HEIGHT } from "./constants";
import DepthSliderBar from "./depth-slider-bar";
import SpanNodeRenderer from "./span-node-renderer";
import { computeSubtreeRowRanges } from "./timeline-utils";

const MAX_ZOOM = 72;
const MIN_ZOOM = 1;
const ZOOM_INCREMENT = 0.5;

const Timeline = () => {
  const {
    leftTree,
    rightTree,
    leftExpandedRowMap,
    rightExpandedRowMap,
    leftTotalRows,
    rightTotalRows,
    leftTrace,
    rightTrace,
    timelineDepth,
    blockSummaries,
    expandOneLevel,
    selectBlock,
    selectedBlockSpanId,
    timelineZoom,
    setTimelineZoom,
  } = useTraceDiffStore((s) => ({
    leftTree: s.leftTree,
    rightTree: s.rightTree,
    leftExpandedRowMap: s.leftExpandedRowMap,
    rightExpandedRowMap: s.rightExpandedRowMap,
    leftTotalRows: s.leftTotalRows,
    rightTotalRows: s.rightTotalRows,
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
    timelineDepth: s.timelineDepth,
    blockSummaries: s.blockSummaries,
    expandOneLevel: s.expandOneLevel,
    selectBlock: s.selectBlock,
    selectedBlockSpanId: s.selectedBlockSpanId,
    timelineZoom: s.timelineZoom,
    setTimelineZoom: s.setTimelineZoom,
  }));

  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Pre-compute subtree row ranges for overlay positioning
  const leftSubtreeRanges = useMemo(
    () => (leftTree ? computeSubtreeRowRanges(leftTree, leftExpandedRowMap) : new Map()),
    [leftTree, leftExpandedRowMap]
  );
  const rightSubtreeRanges = useMemo(
    () => (rightTree ? computeSubtreeRowRanges(rightTree, rightExpandedRowMap) : new Map()),
    [rightTree, rightExpandedRowMap]
  );

  // Compute durations
  const leftStartMs = leftTrace ? new Date(leftTrace.startTime).getTime() : 0;
  const rightStartMs = rightTrace ? new Date(rightTrace.startTime).getTime() : 0;
  const leftDurationMs = leftTrace
    ? new Date(leftTrace.endTime).getTime() - new Date(leftTrace.startTime).getTime()
    : 0;
  const rightDurationMs = rightTrace
    ? new Date(rightTrace.endTime).getTime() - new Date(rightTrace.startTime).getTime()
    : 0;
  const sharedDurationMs = Math.max(leftDurationMs, rightDurationMs, 1);

  // Time markers
  const { markers: timeMarkers, setContainerRef } = useDynamicTimeIntervals({
    totalDurationMs: sharedDurationMs,
    zoom: timelineZoom,
  });

  const combinedScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      setContainerRef(node);
    },
    [setContainerRef]
  );

  // Hover needle
  const [needleLeft, setNeedleLeft] = useState<number | null>(null);
  const [hoverTimeMs, setHoverTimeMs] = useState<number | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = scrollRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      if (mouseX < 0 || mouseX > rect.width) {
        setNeedleLeft(null);
        setHoverTimeMs(null);
        return;
      }

      setNeedleLeft((mouseX / rect.width) * 100);

      const absoluteX = mouseX + el.scrollLeft;
      const timePercent = absoluteX / el.scrollWidth;
      setHoverTimeMs(timePercent * sharedDurationMs);
    },
    [sharedDurationMs]
  );

  const handleMouseLeave = useCallback(() => {
    setNeedleLeft(null);
    setHoverTimeMs(null);
  }, []);

  // Cmd/Ctrl+scroll zoom
  const zoomRef = useRef(timelineZoom);
  const setZoomRef = useRef(setTimelineZoom);
  useEffect(() => {
    zoomRef.current = timelineZoom;
  }, [timelineZoom]);
  useEffect(() => {
    setZoomRef.current = setTimelineZoom;
  }, [setTimelineZoom]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();

      const direction = e.deltaY < 0 ? "in" : e.deltaY > 0 ? "out" : null;
      if (!direction) return;

      const el = scrollRef.current;
      if (!el) return;

      const currentZoom = zoomRef.current;
      const oldScrollLeft = el.scrollLeft;
      const oldScrollWidth = el.scrollWidth;
      const containerRect = el.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const contentX = oldScrollLeft + mouseX;
      const fraction = contentX / oldScrollWidth;

      const newZoom = direction === "in" ? currentZoom + ZOOM_INCREMENT : currentZoom - ZOOM_INCREMENT;
      if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;

      setZoomRef.current(newZoom);

      const zoomRatio = newZoom / currentZoom;
      const newScrollWidth = oldScrollWidth * zoomRatio;
      const newScrollLeft = fraction * newScrollWidth - mouseX;

      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = Math.max(0, Math.min(newScrollLeft, newScrollWidth - containerRect.width));
        }
      });
    };

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, []);

  // Scroll state for sticky header
  const [isScrolled, setIsScrolled] = useState(false);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 0);
  }, []);

  // Content heights
  const leftContentHeight = (leftTotalRows + 1) * DIFF_ROW_HEIGHT;
  const rightContentHeight = (rightTotalRows + 1) * DIFF_ROW_HEIGHT;

  // Click handlers per side
  const handleLeftClick = useCallback(
    (spanId: string, isCondensed: boolean) => {
      selectBlock(spanId, "left");
      if (isCondensed) expandOneLevel();
    },
    [selectBlock, expandOneLevel]
  );

  const handleRightClick = useCallback(
    (spanId: string, isCondensed: boolean) => {
      selectBlock(spanId, "right");
      if (isCondensed) expandOneLevel();
    },
    [selectBlock, expandOneLevel]
  );

  // Shared time markers renderer
  const renderMarkers = useCallback(
    () =>
      timeMarkers.map((marker, index) => (
        <div
          key={`marker-${index}`}
          className="absolute top-0 bottom-0 w-px pointer-events-none bg-muted"
          style={{ left: `${marker.positionPercent}%` }}
        />
      )),
    [timeMarkers]
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Depth slider bar — outside scroll area */}
      <DepthSliderBar />

      {/* Shared horizontal scroll container */}
      <div ref={wrapperRef} className="flex-1 min-h-0 relative">
        <div
          ref={combinedScrollRef}
          className="overflow-x-auto overflow-y-hidden h-full minimal-scrollbar"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="px-2 h-full" style={{ width: `${100 * timelineZoom}%` }}>
            <div className="relative h-full flex flex-col">
              {/* Vertical marker lines — full height */}
              {renderMarkers()}

              {/* Sticky time labels */}
              <div
                className={cn(
                  "sticky top-0 z-30 h-6 text-xs pointer-events-none select-none flex-shrink-0",
                  isScrolled && "bg-gradient-to-b from-transparent to-muted/50"
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

              {/* Top half — left trace (independent vertical scroll) */}
              <div
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-muted/50 minimal-scrollbar"
                onScroll={handleScroll}
              >
                <div className="relative" style={{ minHeight: leftContentHeight }}>
                  {leftTree?.map((rootNode) => (
                    <SpanNodeRenderer
                      key={rootNode.span.spanId}
                      node={rootNode}
                      timelineDepth={timelineDepth}
                      expandedRowMap={leftExpandedRowMap}
                      subtreeRowRanges={leftSubtreeRanges}
                      totalDurationMs={sharedDurationMs}
                      traceStartMs={leftStartMs}
                      blockSummaries={blockSummaries}
                      selectedBlockSpanId={selectedBlockSpanId}
                      onSpanClick={handleLeftClick}
                    />
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border flex-shrink-0" />

              {/* Bottom half — right trace (independent vertical scroll) */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-muted/50 minimal-scrollbar">
                <div className="relative" style={{ minHeight: rightContentHeight }}>
                  {rightTree?.map((rootNode) => (
                    <SpanNodeRenderer
                      key={rootNode.span.spanId}
                      node={rootNode}
                      timelineDepth={timelineDepth}
                      expandedRowMap={rightExpandedRowMap}
                      subtreeRowRanges={rightSubtreeRanges}
                      totalDurationMs={sharedDurationMs}
                      traceStartMs={rightStartMs}
                      blockSummaries={blockSummaries}
                      selectedBlockSpanId={selectedBlockSpanId}
                      onSpanClick={handleRightClick}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hover Needle */}
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

        {/* Zoom controls — bottom right */}
        <div className="absolute bottom-1.5 right-1.5 z-40 flex items-center bg-muted border rounded-md px-0.5 h-[24px]">
          <Button
            disabled={timelineZoom >= MAX_ZOOM}
            className="size-5 min-w-5"
            variant="ghost"
            size="icon"
            onClick={() => setTimelineZoom(timelineZoom + ZOOM_INCREMENT)}
          >
            <Plus className="size-3" />
          </Button>
          <Button
            disabled={timelineZoom <= MIN_ZOOM}
            className="size-5 min-w-5"
            variant="ghost"
            size="icon"
            onClick={() => setTimelineZoom(timelineZoom - ZOOM_INCREMENT)}
          >
            <Minus className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
