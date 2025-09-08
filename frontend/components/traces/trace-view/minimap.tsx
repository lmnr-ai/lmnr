"use client";

import { isEmpty } from "lodash";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils.ts";

import { useScrollContext } from "./virtualization-context";

interface Props {
  traceDuration: number;
}

const MIN_H = 1;
const TREE_TOP_PADDING = 0;
const PIXELS_PER_SECOND = 4
const TIME_MARKER_INTERVAL = 10; // seconds

export default function Minimap({ traceDuration }: Props) {
  const { state, scrollTo, spanItems, createScrollHandler } = useScrollContext();
  const minimapRef = useRef<HTMLDivElement>(null);

  const spansWithPosition = useMemo(() => {
    if (isEmpty(spanItems)) return [];

    const minTime = Math.min(...spanItems.map((s) => new Date(s.span.startTime).getTime()));

    return spanItems.map((s) => {
      const startTime = new Date(s.span.startTime).getTime();
      const endTime = new Date(s.span.endTime).getTime();
      const spanDuration = (endTime - startTime) / 1000; // Convert to seconds
      const relativeStart = (startTime - minTime) / 1000; // Convert to seconds

      console.log(relativeStart + spanDuration);

      return {
        ...s.span,
        y: relativeStart * PIXELS_PER_SECOND,
        height: Math.max(MIN_H, spanDuration * PIXELS_PER_SECOND),
      };
    });
  }, [spanItems, traceDuration]);

  const visibleRange = useMemo(() => {
    const { scrollTop, viewportHeight } = state;
    const adjustedScrollTop = Math.max(0, scrollTop - TREE_TOP_PADDING);
    const visibleStartY = adjustedScrollTop;
    const visibleEndY = adjustedScrollTop + viewportHeight;

    // Find spans that are visible in the current viewport
    const start = spansWithPosition.findIndex(span => span.y + span.height >= visibleStartY);
    const end = spansWithPosition.findLastIndex(span => span.y <= visibleEndY);

    return {
      start: Math.max(0, start === -1 ? 0 : start),
      end: Math.min(spansWithPosition.length - 1, end === -1 ? spansWithPosition.length - 1 : end)
    };
  }, [state, spansWithPosition]);

  const timeMarkers = useMemo(() => {
    if (!traceDuration || traceDuration <= 0) return [];

    const markers = [];
    const totalSeconds = Math.ceil(traceDuration / 1000); // Convert ms to seconds

    for (let seconds = 0; seconds <= totalSeconds; seconds += TIME_MARKER_INTERVAL) {
      markers.push({
        seconds,
        y: seconds * PIXELS_PER_SECOND,
        label: `${seconds}s`,
      });
    }

    return markers;
  }, [traceDuration]);

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
        const scrollRatio = treeMaxScroll / minimapMaxScroll;
        const targetTreeScroll = minimapScrollTop * scrollRatio;
        scrollTo(targetTreeScroll);
      }
    },

    [state, scrollTo]
  );

  const handleTreeScroll = createScrollHandler("tree", syncTreeToMinimap);
  const handleMinimapScroll = createScrollHandler("minimap", syncMinimapToTree);

  useEffect(() => {
    const { totalHeight, scrollTop, viewportHeight } = state;
    if (!isFinite(totalHeight) || totalHeight <= 0) return;

    handleTreeScroll({
      currentTarget: {
        scrollTop,
        scrollHeight: totalHeight,
        clientHeight: viewportHeight,
      },
    } as React.UIEvent<HTMLDivElement>);
  }, [state.scrollTop, handleTreeScroll, state]);

  const handleSpanClick = useCallback(
    (spanIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const span = spansWithPosition[spanIndex];
      if (span) {
        scrollTo(span.y);
      }
    },
    [scrollTo, spansWithPosition]
  );

  if (!spanItems.length) {
    return <div className="h-full w-full p-2 relative" />;
  }

  return (
    <div className="absolute top-0 right-2 h-full w-fit bg-background z-50 py-1">
      <div
        ref={minimapRef}
        className="h-full no-scrollbar no-scrollbar::-webkit-scrollbar overflow-auto overflow-x-hidden w-10 relative"
        onScroll={handleMinimapScroll}
      >
        {/* Time markers */}
        {timeMarkers.map((marker) => (
          <div
            key={`marker-${marker.seconds}`}
            className="absolute right-0 flex pointer-events-none  border-t"
            style={{ top: marker.y }}
          >
            <span className="text-xs text-muted-foreground/60 leading-none">
              {marker.label}
            </span>
          </div>
        ))}

        {spansWithPosition.map((span, index) => {
          const isInVisibleRange = index >= visibleRange.start && index <= visibleRange.end;
          return (
            <div
              style={{
                top: span.y + index,
                height: span.height + 4,
              }}
              key={span.spanId}
              className="absolute bg-background"
            >
              <div
                className={cn("w-2 cursor-pointer rounded-[2px] transition-opacity duration-100 opacity-40", {
                  "opacity-100": isInVisibleRange,
                })}
                style={{
                  backgroundColor: span.status === "error" ? "rgba(204, 51, 51, 1)" : span.color,
                  height: Math.max(MIN_H, span.height),
                  marginTop: 2,
                  marginBottom: 2,
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
