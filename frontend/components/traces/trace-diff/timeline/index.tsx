"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ROW_HEIGHT } from "@/components/traces/trace-view/condensed-timeline/condensed-timeline-element";
import {
  formatTimeMarkerLabel,
  useDynamicTimeIntervals,
} from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { useHoverNeedle } from "@/components/traces/trace-view/condensed-timeline/use-hover-needle";
import { useWheelZoom } from "@/components/traces/trace-view/condensed-timeline/use-wheel-zoom";
import { Button } from "@/components/ui/button";
import { type BlockSummaryInput, generateBlockSummaries } from "@/lib/actions/trace/diff/summarize";
import { cn } from "@/lib/utils";

import { useTraceDiffStore } from "../trace-diff-store";
import CondensedBlockComponent from "./condensed-block";
import DepthSliderBar from "./depth-slider-bar";

const MAX_ZOOM = 18;
const MIN_ZOOM = 1;
const ZOOM_INCREMENT = 0.5;

const Timeline = () => {
  const {
    leftBlocks,
    rightBlocks,
    leftTrace,
    rightTrace,
    leftTotalRows,
    rightTotalRows,
    blockSummaries,
    addBlockSummaries,
    setIsSummarizationLoading,
    expandOneLevel,
    selectBlock,
    selectedBlockSpanId,
    timelineZoom,
    setTimelineZoom,
  } = useTraceDiffStore((s) => ({
    leftBlocks: s.leftBlocks,
    rightBlocks: s.rightBlocks,
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
    leftTotalRows: s.leftTotalRows,
    rightTotalRows: s.rightTotalRows,
    blockSummaries: s.blockSummaries,
    addBlockSummaries: s.addBlockSummaries,
    setIsSummarizationLoading: s.setIsSummarizationLoading,
    expandOneLevel: s.expandOneLevel,
    selectBlock: s.selectBlock,
    selectedBlockSpanId: s.selectedBlockSpanId,
    timelineZoom: s.timelineZoom,
    setTimelineZoom: s.setTimelineZoom,
  }));

  const scrollRef = useRef<HTMLDivElement>(null);

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
  const { needleLeft, hoverTimeMs, handleMouseMove, handleMouseLeave } = useHoverNeedle(scrollRef, sharedDurationMs);

  // Cmd/Ctrl+scroll zoom
  useWheelZoom(scrollRef, timelineZoom, setTimelineZoom);

  // Scroll state for sticky header
  const [isScrolled, setIsScrolled] = useState(false);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 0);
  }, []);

  // Content heights
  const leftContentHeight = (leftTotalRows + 1) * ROW_HEIGHT;
  const rightContentHeight = (rightTotalRows + 1) * ROW_HEIGHT;

  // Fetch AI summaries for condensed blocks
  const prevBlockKeyRef = useRef<string>("");

  useEffect(() => {
    const allBlocks = [...leftBlocks, ...rightBlocks];
    const unsummarized = allBlocks.filter((b) => !blockSummaries[b.parentSpanId] && b.spanCount > 1);
    if (unsummarized.length === 0) return;

    const uniqueBlocks = new Map<string, (typeof unsummarized)[0]>();
    for (const b of unsummarized) {
      uniqueBlocks.set(b.parentSpanId, b);
    }

    const blockKey = [...uniqueBlocks.keys()].sort().join(",");
    if (blockKey === prevBlockKeyRef.current) return;
    prevBlockKeyRef.current = blockKey;

    const inputs: BlockSummaryInput[] = [...uniqueBlocks.values()].map((b) => ({
      blockId: b.parentSpanId,
      spanName: b.spanName,
      spanType: b.primarySpanType,
      childNames: b.childNames,
      childTypes: b.childTypes,
    }));

    setIsSummarizationLoading(true);
    generateBlockSummaries(inputs)
      .then((results) => {
        const summaryMap: Record<string, { summary: string; icon: string }> = {};
        for (const r of results) {
          summaryMap[r.blockId] = { summary: r.summary, icon: r.icon };
        }
        addBlockSummaries(summaryMap);
      })
      .catch((e) => {
        console.error("Failed to generate block summaries:", e);
      })
      .finally(() => {
        setIsSummarizationLoading(false);
      });
  }, [leftBlocks, rightBlocks, blockSummaries, addBlockSummaries, setIsSummarizationLoading]);

  const handleBlockClick = useCallback(
    (spanId: string, side: "left" | "right") => {
      selectBlock(spanId, side);
      expandOneLevel();
    },
    [selectBlock, expandOneLevel]
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden relative">
      <DepthSliderBar />

      {/* Scrollable timeline — matches condensed timeline structure */}
      <div
        ref={combinedScrollRef}
        className="flex-1 overflow-auto relative min-h-0 bg-muted/50 h-full minimal-scrollbar"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onScroll={handleScroll}
      >
        <div className="px-2 h-full">
          <div className="relative h-full" style={{ width: `${100 * timelineZoom}%` }}>
            {/* Vertical time marker lines */}
            {timeMarkers.map((marker, index) => (
              <div
                key={`marker-${index}`}
                className="absolute top-0 bottom-0 w-px pointer-events-none bg-muted"
                style={{ left: `${marker.positionPercent}%` }}
              />
            ))}

            {/* Sticky time labels */}
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

            {/* Left trace blocks */}
            <div className="relative" style={{ minHeight: leftContentHeight }}>
              {leftBlocks.map((block) => (
                <CondensedBlockComponent
                  key={block.parentSpanId}
                  block={block}
                  summary={blockSummaries[block.parentSpanId]}
                  totalDurationMs={sharedDurationMs}
                  traceStartMs={leftStartMs}
                  isSelected={selectedBlockSpanId === block.parentSpanId}
                  onClick={() => handleBlockClick(block.parentSpanId, "left")}
                />
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-border my-1" />

            {/* Right trace blocks */}
            <div className="relative" style={{ minHeight: rightContentHeight }}>
              {rightBlocks.map((block) => (
                <CondensedBlockComponent
                  key={block.parentSpanId}
                  block={block}
                  summary={blockSummaries[block.parentSpanId]}
                  totalDurationMs={sharedDurationMs}
                  traceStartMs={rightStartMs}
                  isSelected={selectedBlockSpanId === block.parentSpanId}
                  onClick={() => handleBlockClick(block.parentSpanId, "right")}
                />
              ))}
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

      {/* Zoom controls — bottom right, matching condensed timeline */}
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
  );
};

export default Timeline;
