import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty } from "lodash";
import React, { memo, useCallback, useEffect, useMemo } from "react";

import { TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { ScrollArea } from "@/components/ui/scroll-area";

import { SpanCard } from "../span-card";
import { useScrollContext } from "./scroll-context";

interface TreeProps {
  onSpanSelect: (span?: TraceViewSpan) => void;
}

const Tree = ({ onSpanSelect }: TreeProps) => {
  const { scrollRef, updateState } = useScrollContext();
  const { getTreeSpans, treeWidth, spans } = useTraceViewStoreContext((state) => ({
    getTreeSpans: state.getTreeSpans,
    treeWidth: state.treeWidth,
    spans: state.spans,
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
  }, [handleScroll, scrollRef?.current]);

  if (isEmpty(treeSpans) && isEmpty(spans)) {
    return <span className="text-base text-secondary-foreground mx-auto mt-4 text-center">No spans found.</span>;
  }

  return (
    <ScrollArea ref={scrollRef} className="overflow-x-hidden grow relative h-full w-full">
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
            className="pl-4"
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
  );
};

export default memo(Tree);
