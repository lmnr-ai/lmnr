"use client";

import { isEmpty } from "lodash";
import React, { useCallback, useMemo, useRef } from "react";

import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils.ts";

import { useScrollSync } from "./scroll-sync";
import { useVirtualizationContext } from "./virtualization-context";

interface Props {
  traceDuration: number;
}

const ITEM_H = 36;
const MIN_H = 4;
const TREE_TOP_PADDING = 4;
const UNIT = 500;

export default function Minimap({ traceDuration }: Props) {
  const { state, scrollTo, spanItems } = useVirtualizationContext();
  const minimapRef = useRef<HTMLDivElement>(null);
  const { createScrollHandler } = useScrollSync();

  const spansWithPosition = useMemo(() => {
    if (isEmpty(spanItems)) return [];

    const minTime = Math.min(...spanItems.map((s) => new Date(s.span.startTime).getTime()));

    return spanItems.map((s) => ({
      ...s.span,
      y: ((new Date(s.span.startTime).getTime() - minTime) * UNIT) / traceDuration,
      height: Math.max(
        MIN_H,
        Math.round(((new Date(s.span.endTime).getTime() - new Date(s.span.startTime).getTime()) * UNIT) / traceDuration)
      ),
    }));
  }, [spanItems, traceDuration]);

  const visibleRange = useMemo(() => {
    const { scrollTop, viewportHeight } = state;
    const adjustedScrollTop = Math.max(0, scrollTop - TREE_TOP_PADDING);
    const start = Math.max(0, Math.floor(adjustedScrollTop / ITEM_H));
    const end = Math.min(spansWithPosition.length - 1, Math.floor((adjustedScrollTop + viewportHeight) / ITEM_H));
    return { start, end };
  }, [state, spansWithPosition.length]);

  const syncTreeToMinimap = useCallback(
    ({
      scrollTop: treeScrollTop,
      scrollHeight: treeScrollHeight,
      clientHeight: treeClientHeight,
    }: {
      scrollTop: number;
      scrollHeight: number;
      clientHeight: number;
    }) => {
      if (!minimapRef.current) return;

      const minimap = minimapRef.current;
      const minimapScrollHeight = minimap.scrollHeight;
      const minimapClientHeight = minimap.clientHeight;

      const treeMaxScroll = Math.max(0, treeScrollHeight - treeClientHeight);
      const minimapMaxScroll = Math.max(0, minimapScrollHeight - minimapClientHeight);

      if (treeMaxScroll > 0 && minimapMaxScroll > 0) {
        const scrollRatio = minimapMaxScroll / treeMaxScroll;
        minimap.scrollTop = treeScrollTop * scrollRatio;
      }
    },
    []
  );

  const syncMinimapToTree = useCallback(
    ({
      scrollTop: minimapScrollTop,
      scrollHeight: minimapScrollHeight,
      clientHeight: minimapClientHeight,
    }: {
      scrollTop: number;
      scrollHeight: number;
      clientHeight: number;
    }) => {
      const { totalHeight, viewportHeight } = state;

      const minimapMaxScroll = Math.max(0, minimapScrollHeight - minimapClientHeight);
      const treeMaxScroll = Math.max(0, totalHeight - viewportHeight);

      if (minimapMaxScroll > 0 && treeMaxScroll > 0) {
        // Calculate the ratio between the two scrollable areas
        const scrollRatio = treeMaxScroll / minimapMaxScroll;
        const targetTreeScroll = minimapScrollTop * scrollRatio;
        scrollTo(targetTreeScroll);
      }
    },

    [state, scrollTo]
  );

  const handleMinimapScroll = createScrollHandler("minimap", syncMinimapToTree);

  const handleSpanClick = useCallback(
    (spanIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      scrollTo(spanIndex * ITEM_H);
    },
    [scrollTo]
  );

  if (!spanItems.length) {
    return <div className="h-full w-full p-2 relative" />;
  }

  return (
    <div className="absolute top-1 right-3 h-full w-fit bg-background z-50">
      <div
        ref={minimapRef}
        className="h-full no-scrollbar no-scrollbar::-webkit-scrollbar overflow-auto overflow-x-hidden w-8 relative"
        onScroll={handleMinimapScroll}
      >
        {spansWithPosition.map((span, index) => {
          const isInVisibleRange = index >= visibleRange.start && index <= visibleRange.end;
          return (
            <div style={{ top: span.y }} key={span.spanId} className="absolute bg-background">
              <div
                className={cn("w-8 cursor-pointer rounded-[2px] my-0.5 transition-opacity duration-100 opacity-40", {
                  "opacity-100": isInVisibleRange,
                })}
                style={{
                  backgroundColor: span.status === "error" ? "rgba(204, 51, 51, 1)" : SPAN_TYPE_TO_COLOR[span.spanType],
                  height: `${span.height}px`,
                }}
                onClick={(e) => handleSpanClick(index, e)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
