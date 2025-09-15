import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty } from "lodash";
import React, { memo, useMemo, useRef } from "react";

import TimelineElement from "@/components/traces/trace-view/timeline-element";
import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton.tsx";

function Timeline() {
  const ref = useRef<HTMLDivElement>(null);

  const { getTimelineData, zoom, browserSessionTime, selectedSpan, setSelectedSpan, isSpansLoading } =
    useTraceViewStoreContext((state) => ({
      getTimelineData: state.getTimelineData,
      zoom: state.zoom,
      browserSessionTime: state.sessionTime,
      selectedSpan: state.selectedSpan,
      setSelectedSpan: state.setSelectedSpan,
      isSpansLoading: state.isSpansLoading,
    }));

  const { spans, startTime, timeIntervals, timelineWidthInMilliseconds } = useMemo(
    () => getTimelineData(),
    [getTimelineData]
  );

  const virtualizer = useVirtualizer({
    count: spans.length,
    getScrollElement: () => ref.current,
    estimateSize: () => 32, // HEIGHT + margin
    overscan: 100,
  });

  const items = virtualizer.getVirtualItems();

  if (isSpansLoading) {
    return (
      <div className="flex flex-col gap-2 p-2 pb-4 w-full min-w-full">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (isEmpty(spans)) {
    return <span className="text-base text-secondary-foreground mx-auto mt-4 text-center">No spans found.</span>;
  }

  return (
    <ScrollArea className="h-full w-full relative" ref={ref}>
      <div
        style={{ width: `${100 * zoom}%` }}
        className="sticky top-0 z-20 bg-background flex flex-1 text-xs border-b h-8 px-4"
      >
        {browserSessionTime && (
          <div
            className="absolute top-0 bg-primary z-50 w-[1px]"
            style={{
              left: ((browserSessionTime - startTime) / timelineWidthInMilliseconds) * 100 + "%",
              height: virtualizer.getTotalSize() + 32,
            }}
          />
        )}
        <div className="flex w-full relative">
          {timeIntervals.map((interval, index) => (
            <div className="flex items-center h-full w-[10%]" key={index}>
              <div className="border-l border-secondary-foreground/20 h-full" />
              <div className="text-secondary-foreground truncate flex ml-1 justify-center">{interval}</div>
            </div>
          ))}
          <div className="flex items-center h-full">
            <div className="border-r border-secondary-foreground/20 h-full" />
          </div>
        </div>
      </div>
      <div style={{ height: virtualizer.getTotalSize(), width: `${100 * zoom}%` }}>
        <div
          className="overflow-hidden"
          style={{
            position: "relative",
            height: virtualizer.getTotalSize(),
          }}
        >
          {items.map((virtualRow) => (
            <TimelineElement
              key={virtualRow.key}
              selectedSpan={selectedSpan}
              setSelectedSpan={setSelectedSpan}
              span={spans[virtualRow.index]}
              virtualRow={virtualRow}
            />
          ))}
        </div>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

export default memo(Timeline);
