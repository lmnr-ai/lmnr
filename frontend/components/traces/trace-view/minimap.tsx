"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils.ts";

import { useScrollContext } from "./scroll-context";

interface Props {
  onSpanSelect: (span?: TraceViewSpan) => void;
}

export default function Minimap({ onSpanSelect }: Props) {
  const { state, scrollTo, createScrollHandler } = useScrollContext();
  const { getMinimapSpans, trace, browserSessionTime, spans } = useTraceViewStoreContext((state) => ({
    getMinimapSpans: state.getMinimapSpans,
    trace: state.trace,
    browserSessionTime: state.sessionTime,
    spans: state.spans,
  }));

  const traceDuration = useMemo(
    () => new Date(trace?.endTime || 0).getTime() - new Date(trace?.startTime || 0).getTime(),
    [trace?.endTime, trace?.startTime]
  );

  const minimapSpans = useMemo(() => getMinimapSpans(), [getMinimapSpans, spans]);

  // Dynamic PIXELS_PER_SECOND based on trace duration
  const pixelsPerSecond = useMemo(() => {
    if (!traceDuration || traceDuration <= 0) return 4;

    const durationInSeconds = traceDuration / 1000;

    if (durationInSeconds <= 30) {
      return 16;
    } else if (durationInSeconds <= 120) {
      return 12;
    } else if (durationInSeconds <= 300) {
      return 4;
    } else {
      return 3;
    }
  }, [traceDuration]);

  const timeMarkerInterval = useMemo(() => {
    if (pixelsPerSecond == 16) {
      return 2;
    } else if (pixelsPerSecond == 12) {
      return 4;
    } else if (pixelsPerSecond == 4) {
      return 10;
    } else {
      return 10;
    }
  }, [pixelsPerSecond]);

  const minTime = useMemo(
    () => Math.min(...minimapSpans.map((s) => new Date(s.span.startTime).getTime())),
    [minimapSpans]
  );

  const minimapRef = useRef<HTMLDivElement>(null);

  const timeMarkers = useMemo(() => {
    if (!traceDuration || traceDuration <= 0) return [];

    const markers = [];
    const totalSeconds = Math.ceil(traceDuration / 1000);

    for (let seconds = 0; seconds <= totalSeconds; seconds += timeMarkerInterval) {
      markers.push({
        seconds,
        label: `${seconds}s`,
      });
    }

    return markers;
  }, [traceDuration, timeMarkerInterval]);

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
      const span = minimapSpans[spanIndex];

      if (span) {
        scrollTo(span.yOffset - 48);
        onSpanSelect(span.span);
      }
    },
    [minimapSpans, scrollTo, onSpanSelect]
  );

  if (!minimapSpans.length) {
    return null;
  }

  return (
    <div className="h-full flex-none max-w-16 w-fit z-30 border-l">
      <div
        ref={minimapRef}
        className="h-full py-1 no-scrollbar no-scrollbar::-webkit-scrollbar overflow-auto overflow-x-hidden flex space-x-1 relative"
        onScroll={handleMinimapScroll}
      >
        <div>
          {browserSessionTime && (
            <div
              className="bg-primary absolute top-0 left-0 w-full h-[1px] z-30"
              style={{
                top: Math.max(0, ((browserSessionTime - minTime) / 1000) * pixelsPerSecond),
              }}
            />
          )}
        </div>
        <div className="relative w-2 flex-none">
          {minimapSpans.map((span, index) => (
            <div
              style={{
                top: span.y,
                height: span.height,
                left: 0,
              }}
              key={span.spanId}
              className="bg-background absolute opacity-80 hover:opacity-100 duration-100 transition-opacity"
            >
              <div
                className={cn("w-2 cursor-pointer rounded-[2px] h-full transition-all")}
                style={{
                  backgroundColor: span.status === "error" ? "rgb(204, 51, 51)" : SPAN_TYPE_TO_COLOR[span.spanType],
                  marginTop: 2,
                  paddingBottom: 0,
                }}
                onClick={(e) => handleSpanClick(index, e)}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-col pr-1">
          {timeMarkers.map((marker) => (
            <div
              key={`marker-${marker.seconds}`}
              className="flex pointer-events-none w-full text-right"
              style={{
                minHeight: `${pixelsPerSecond * timeMarkerInterval}px`,
              }}
            >
              <span className="text-xs text-muted-foreground/60 leading-none font-mono text-right w-full">
                {marker.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
