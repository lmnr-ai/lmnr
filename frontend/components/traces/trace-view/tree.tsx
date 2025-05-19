import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty } from "lodash";
import React, { ReactNode, useCallback, useMemo, useRef } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Span, Trace } from "@/lib/traces/types";

import { SpanCard } from "../span-card";

interface TreeProps {
  topLevelSpans: Span[];
  childSpans: { [key: string]: Span[] };
  activeSpans: string[];
  collapsedSpans: Set<string>;
  containerWidth: number;
  selectedSpan: Span | null;
  trace: Trace | null;
  isSpansLoading: boolean;
  onToggleCollapse: (spanId: string) => void;
  onSpanSelect: (span: Span) => void;
  onSelectTime?: (time: number) => void;
}

export default function Tree({
  topLevelSpans,
  childSpans,
  activeSpans,
  collapsedSpans,
  containerWidth,
  selectedSpan,
  trace,
  isSpansLoading,
  onToggleCollapse,
  onSpanSelect,
  onSelectTime,
}: TreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const maxY = useRef(0);

  const recFn = useCallback(
    (
      treeElements: React.ReactNode[],
      span: Span,
      activeSpans: string[],
      depth: number,
      parentY: number,
      childSpans: { [key: string]: Span[] },
      containerWidth: number,
      collapsedSpans: Set<string>,
      traceStartTime: string,
      selectedSpan?: Span | null,
      onToggleCollapse?: (spanId: string) => void,
      onSpanSelect?: (span: Span) => void,
      onSelectTime?: (time: number) => void
    ) => {
      const yOffset = maxY.current + 36;

      const card = (
        <SpanCard
          span={span}
          parentY={parentY}
          activeSpans={activeSpans}
          yOffset={yOffset}
          childSpans={childSpans}
          containerWidth={containerWidth}
          depth={depth}
          selectedSpan={selectedSpan}
          collapsedSpans={collapsedSpans}
          traceStartTime={traceStartTime}
          onSpanSelect={onSpanSelect}
          onToggleCollapse={onToggleCollapse}
          onSelectTime={onSelectTime}
        />
      );

      treeElements.push(card);
      maxY.current = maxY.current + 36;

      const children = childSpans[span.spanId];
      if (!children) {
        return;
      }

      const py = maxY.current;

      if (collapsedSpans.has(span.spanId)) {
        return;
      }

      for (const childSpan of children) {
        recFn(
          treeElements,
          childSpan,
          activeSpans,
          depth + 1,
          py,
          childSpans,
          containerWidth,
          collapsedSpans,
          traceStartTime,
          selectedSpan,
          onToggleCollapse,
          onSpanSelect,
          onSelectTime
        );
      }
    },
    []
  );

  const renderTreeElements = useCallback((): ReactNode[] => {
    maxY.current = 0;

    let treeElements: React.ReactNode[] = [];

    for (const span of topLevelSpans) {
      recFn(
        treeElements,
        span,
        activeSpans,
        0,
        0,
        childSpans,
        containerWidth,
        collapsedSpans,
        String(trace?.startTime),
        selectedSpan,
        onToggleCollapse,
        onSpanSelect,
        onSelectTime
      );
    }

    return treeElements;
  }, [
    activeSpans,
    childSpans,
    collapsedSpans,
    containerWidth,
    recFn,
    selectedSpan,
    topLevelSpans,
    trace,
    onToggleCollapse,
    onSpanSelect,
    onSelectTime,
  ]);

  const treeElements = useMemo(() => renderTreeElements(), [renderTreeElements]);

  const virtualizer = useVirtualizer({
    count: treeElements.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
  });

  const items = virtualizer.getVirtualItems();

  if (isSpansLoading) {
    return (
      <div className="flex flex-col gap-2 p-2 pb-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!isSpansLoading && isEmpty(topLevelSpans)) {
    return <span className="text-base text-secondary-foreground mx-auto mt-4">No spans found.</span>;
  }

  return (
    <ScrollArea ref={scrollRef} className="overflow-y-auto overflow-x-hidden flex-grow">
      <div className="flex flex-col pb-4 pt-1">
        <div
          className="relative"
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          <div
            className="pl-6"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${items[0]?.start ?? 0}px)`,
            }}
          >
            {items.map((virtualRow) => {
              const element = treeElements[virtualRow.index];
              return (
                <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                  {element}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
