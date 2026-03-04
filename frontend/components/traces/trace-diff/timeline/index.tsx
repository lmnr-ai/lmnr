"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { type BlockSummaryInput, generateBlockSummaries } from "@/lib/actions/trace/diff/summarize";

import { useTraceDiffStore } from "../trace-diff-store";
import DepthSliderBar from "./depth-slider-bar";
import SharedTimeAxis from "./shared-time-axis";
import TimelineSwimlane from "./timeline-swimlane";

const MIN_TIMELINE_WIDTH = 800;

const Timeline = () => {
  const {
    leftBlocks,
    rightBlocks,
    leftTrace,
    rightTrace,
    blockSummaries,
    addBlockSummaries,
    setIsSummarizationLoading,
    expandOneLevel,
    selectBlock,
  } = useTraceDiffStore((s) => ({
    leftBlocks: s.leftBlocks,
    rightBlocks: s.rightBlocks,
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
    blockSummaries: s.blockSummaries,
    addBlockSummaries: s.addBlockSummaries,
    setIsSummarizationLoading: s.setIsSummarizationLoading,
    expandOneLevel: s.expandOneLevel,
    selectBlock: s.selectBlock,
  }));

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);

  const containerWidth = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        if (!containerNode) return () => {};
        const observer = new ResizeObserver(onStoreChange);
        observer.observe(containerNode);
        return () => observer.disconnect();
      },
      [containerNode]
    ),
    () => containerNode?.clientWidth ?? 0,
    () => 0
  );

  // Compute shared duration from both traces
  const leftStartMs = leftTrace ? new Date(leftTrace.startTime).getTime() : 0;
  const rightStartMs = rightTrace ? new Date(rightTrace.startTime).getTime() : 0;
  const leftDurationMs = leftTrace
    ? new Date(leftTrace.endTime).getTime() - new Date(leftTrace.startTime).getTime()
    : 0;
  const rightDurationMs = rightTrace
    ? new Date(rightTrace.endTime).getTime() - new Date(rightTrace.startTime).getTime()
    : 0;
  const sharedDurationMs = Math.max(leftDurationMs, rightDurationMs, 1);

  const timelineWidthPx = Math.max(containerWidth, MIN_TIMELINE_WIDTH);

  // Fetch AI summaries for blocks that don't have them yet
  const prevBlockKeyRef = useRef<string>("");

  useEffect(() => {
    const allBlocks = [...leftBlocks, ...rightBlocks];
    const unsummarized = allBlocks.filter((b) => !blockSummaries[b.parentSpanId] && b.spanCount > 1);

    if (unsummarized.length === 0) return;

    // Deduplicate and build a stable key
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

  // Preserve scroll position on depth change
  const scrollLeftRef = useRef(0);
  const timelineDepth = useTraceDiffStore((s) => s.timelineDepth);

  useEffect(() => {
    scrollLeftRef.current = scrollContainerRef.current?.scrollLeft ?? 0;
  });

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollLeftRef.current;
    }
  }, [timelineDepth]);

  const handleLeftBlockClick = useCallback(
    (spanId: string) => {
      selectBlock(spanId, "left");
      expandOneLevel();
    },
    [selectBlock, expandOneLevel]
  );

  const handleRightBlockClick = useCallback(
    (spanId: string) => {
      selectBlock(spanId, "right");
      expandOneLevel();
    },
    [selectBlock, expandOneLevel]
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden" ref={setContainerNode}>
      <DepthSliderBar />
      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={scrollContainerRef}>
        <div style={{ width: timelineWidthPx }} className="flex flex-col h-full">
          <SharedTimeAxis sharedDurationMs={sharedDurationMs} timelineWidthPx={timelineWidthPx} />
          <div className="flex flex-col flex-1 min-h-0 divide-y">
            <TimelineSwimlane
              label="Trace A"
              blocks={leftBlocks}
              summaries={blockSummaries}
              sharedDurationMs={sharedDurationMs}
              traceStartMs={leftStartMs}
              timelineWidthPx={timelineWidthPx}
              onBlockClick={handleLeftBlockClick}
            />
            <TimelineSwimlane
              label="Trace B"
              blocks={rightBlocks}
              summaries={blockSummaries}
              sharedDurationMs={sharedDurationMs}
              traceStartMs={rightStartMs}
              timelineWidthPx={timelineWidthPx}
              onBlockClick={handleRightBlockClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
