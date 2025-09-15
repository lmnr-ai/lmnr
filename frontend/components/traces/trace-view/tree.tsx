import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty } from "lodash";
import React, { memo, useCallback, useEffect, useMemo } from "react";

import Minimap from "@/components/traces/trace-view/minimap.tsx";
import { TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton.tsx";

import { SpanCard } from "../span-card";
import { useScrollContext } from "./scroll-context";

interface TreeProps {
  onSpanSelect: (span?: TraceViewSpan) => void;
}

const Tree = ({ onSpanSelect }: TreeProps) => {
  const { scrollRef, updateState } = useScrollContext();
  const { getTreeSpans, treeWidth, spans, isSpansLoading } = useTraceViewStoreContext((state) => ({
    getTreeSpans: state.getTreeSpans,
    treeWidth: state.treeWidth,
    spans: state.spans,
    isSpansLoading: state.isSpansLoading,
  }));

  const treeSpans = useMemo(() => getTreeSpans(), [getTreeSpans, spans]);

  const virtualizer = useVirtualizer({
    count: treeSpans.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
  });

  const items = virtualizer?.getVirtualItems() || [];

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !virtualizer) return;

    const newState = {
      totalHeight: virtualizer.getTotalSize(),
      viewportHeight: el.clientHeight,
      scrollTop: el.scrollTop,
    };

    if (Object.values(newState).every((val) => isFinite(val) && val >= 0)) {
      updateState(newState);
    }
  }, [scrollRef, updateState, virtualizer]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, scrollRef]);

  if (isSpansLoading) {
    return (
      <div className="flex flex-col gap-2 p-2 pb-4 w-full min-w-full">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (isEmpty(treeSpans)) {
    return <span className="text-base text-secondary-foreground mx-auto mt-4 text-center">No spans found.</span>;
  }

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <ScrollArea ref={scrollRef} className="overflow-x-hidden flex-grow relative h-full w-full">
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
                const spanItem = treeSpans[virtualRow.index];
                if (!spanItem) return null;

                return (
                  <div key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                    <SpanCard
                      span={spanItem.span}
                      parentY={spanItem.parentY}
                      yOffset={spanItem.yOffset}
                      depth={spanItem.depth}
                      containerWidth={treeWidth}
                      onSpanSelect={onSpanSelect}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollArea>
      <Minimap onSpanSelect={onSpanSelect} />
    </div>
  );
};

export default memo(Tree);
