"use client";

import { isEmpty } from "lodash";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils.ts";

import { useVirtualizationContext } from "./virtualization-context";

interface Props {
  traceDuration: number;
}

const ITEM_H = 36;
const MIN_H = 4;
const TREE_TOP_PADDING = 4;
const UNIT = 1000;

export default function Minimap({ traceDuration }: Props) {
  const { state, scrollTo, spanItems } = useVirtualizationContext();
  const minimapRef = useRef<HTMLDivElement>(null);
  const isScrollingFromTree = useRef(false);
  const isScrollingFromMinimap = useRef(false);

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

  useEffect(() => {
    if (isScrollingFromMinimap.current) return;

    const { totalHeight, scrollTop, viewportHeight } = state;
    if (!isFinite(totalHeight) || totalHeight <= 0 || !minimapRef.current) return;

    isScrollingFromTree.current = true;

    const maxScroll = Math.max(0, totalHeight - viewportHeight);
    const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0;

    const minimap = minimapRef.current;
    const minimapHeight = minimap.clientHeight;
    const scrollHeight = minimap.scrollHeight;
    const height = scrollHeight - minimapHeight;

    if (height > 0) {
      minimap.scrollTo(0, height * scrollPercent);
    }

    setTimeout(() => {
      isScrollingFromTree.current = false;
    }, 50);
  }, [state]);

  const handleMinimapScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (isScrollingFromTree.current) return;

      isScrollingFromMinimap.current = true;

      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      const { totalHeight, viewportHeight } = state;

      const maxMinimapScroll = Math.max(0, scrollHeight - clientHeight);
      const scrollPercent = maxMinimapScroll > 0 ? scrollTop / maxMinimapScroll : 0;

      if (totalHeight > viewportHeight) {
        const targetTreeScroll = scrollPercent * (totalHeight - viewportHeight);
        scrollTo(targetTreeScroll);
      }

      setTimeout(() => {
        isScrollingFromMinimap.current = false;
      }, 50);
    },
    [state, scrollTo]
  );

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
        className="h-full no-scrollbar no-scrollbar::-webkit-scrollbar overflow-auto overflow-x-hidden p-1 w-8 relative"
        onScroll={handleMinimapScroll}
      >
        {spansWithPosition.map((span, index) => {
          const isInVisibleRange = index >= visibleRange.start && index <= visibleRange.end;
          return (
            <div style={{ top: span.y }} key={span.spanId} className="absolute w-32 bg-background">
              <div
                className={cn("w-32 cursor-pointer rounded-[2px] mb-0.5 transition-opacity duration-100 opacity-50", {
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
