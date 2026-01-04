import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty } from "lodash";
import React, { memo, useCallback, useEffect, useMemo } from "react";

import { TraceViewSpan, useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store.tsx";
import { useScrollContext } from "@/components/traces/trace-view/scroll-context";

import { SpanCard } from "./span-card";

interface TreeProps {
  onSpanSelect: (span?: TraceViewSpan) => void;
  onSetCachePoint?: (span: TraceViewSpan) => void;
  onUnlock?: (span: TraceViewSpan) => void;
  isSpanCached?: (span: TraceViewSpan) => boolean;
}

const Tree = ({ onSpanSelect, onSetCachePoint, onUnlock, isSpanCached }: TreeProps) => {
  const { scrollRef, updateState } = useScrollContext();
  const { getTreeSpans, spans } = useRolloutSessionStoreContext((state) => ({
    getTreeSpans: state.getTreeSpans,
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
    <div ref={scrollRef} className="overflow-x-hidden overflow-y-auto grow relative h-full w-full styled-scrollbar">
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
                    onSpanSelect={onSpanSelect}
                    onSetCachePoint={onSetCachePoint}
                    onUnlock={onUnlock}
                    isCached={isSpanCached?.(spanItem.span)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(Tree);
