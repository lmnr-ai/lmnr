"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";

import {
  type TraceViewSpan,
  useTraceViewStore,
  useTraceViewStoreContext,
} from "@/components/traces/trace-view/trace-view-store.tsx";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils.ts";

import { useScrollContext } from "./scroll-context";

interface Props {
  onSpanSelect: (span?: TraceViewSpan) => void;
}
function Minimap({ onSpanSelect }: Props) {
  const { state, scrollTo, createScrollHandler, visibleSpanIds } = useScrollContext();
  const { getMinimapSpans, getListMinimapSpans, trace, spans, setSessionTime, browserSession, tab } =
    useTraceViewStoreContext((state) => ({
      getMinimapSpans: state.getMinimapSpans,
      getListMinimapSpans: state.getListMinimapSpans,
      trace: state.trace,
      spans: state.spans,
      setSessionTime: state.setSessionTime,
      browserSession: state.browserSession,
      tab: state.tab,
    }));

  const store = useTraceViewStore();
  const sessionTimeNeedleRef = useRef<HTMLDivElement>(null);
  const hoverTimeNeedleRef = useRef<HTMLDivElement>(null);
  const spansContainerRef = useRef<HTMLDivElement>(null);

  const traceDuration = useMemo(
    () => new Date(trace?.endTime || 0).getTime() - new Date(trace?.startTime || 0).getTime(),
    [trace?.endTime, trace?.startTime]
  );

  const minimapSpans = useMemo(
    () => (tab === "reader" ? getListMinimapSpans() : getMinimapSpans()),
    [tab, getMinimapSpans, getListMinimapSpans, spans]
  );

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

  useEffect(() => {
    const currentSessionTime = store.getState().sessionTime || 0;
    if (sessionTimeNeedleRef.current) {
      const topPosition = Math.max(0, (currentSessionTime * 1000 * pixelsPerSecond) / 1000);
      sessionTimeNeedleRef.current.style.top = `${topPosition}px`;
      sessionTimeNeedleRef.current.style.display = browserSession && currentSessionTime ? "block" : "none";
    }

    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.sessionTime !== prevState.sessionTime || state.browserSession !== prevState.browserSession) {
        const sessionTime = state.sessionTime || 0;
        if (sessionTimeNeedleRef.current) {
          const topPosition = Math.max(0, (sessionTime * 1000 * pixelsPerSecond) / 1000);
          sessionTimeNeedleRef.current.style.top = `${topPosition}px`;
          sessionTimeNeedleRef.current.style.display = state.browserSession && sessionTime ? "block" : "none";
        }
      }
    });

    return unsubscribe;
  }, [store, pixelsPerSecond, trace?.startTime, browserSession]);

  const minimapRef = useRef<HTMLDivElement>(null);

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

  const calculateTimeFromY = useCallback(
    (clientY: number) => {
      if (!minimapRef.current) return null;

      const rect = minimapRef.current.getBoundingClientRect();
      const scrollTop = minimapRef.current.scrollTop;
      const y = clientY - rect.top + scrollTop;

      return Math.max(0, y / pixelsPerSecond);
    },
    [pixelsPerSecond]
  );

  const handleSpanClick = useCallback(
    (spanIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const span = minimapSpans[spanIndex];

      const timeInSeconds = calculateTimeFromY(e.clientY);
      if (timeInSeconds !== null) {
        setSessionTime(timeInSeconds);
      }

      if (hoverTimeNeedleRef.current) {
        hoverTimeNeedleRef.current.style.display = "none";
      }

      if (span) {
        scrollTo(span.yOffset - 48);
        if (!span.pending) {
          onSpanSelect(span.span);
        }
      }
    },
    [minimapSpans, scrollTo, onSpanSelect, calculateTimeFromY, setSessionTime]
  );

  const handleMinimapClick = useCallback(
    (e: React.MouseEvent) => {
      const timeInSeconds = calculateTimeFromY(e.clientY);
      if (timeInSeconds !== null) {
        setSessionTime(timeInSeconds);
      }

      if (hoverTimeNeedleRef.current) {
        hoverTimeNeedleRef.current.style.display = "none";
      }
    },
    [calculateTimeFromY, setSessionTime]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!minimapRef.current || !hoverTimeNeedleRef.current) return;

    const rect = minimapRef.current.getBoundingClientRect();
    const scrollTop = minimapRef.current.scrollTop;
    const y = e.clientY - rect.top + scrollTop;

    hoverTimeNeedleRef.current.style.top = `${y}px`;
    hoverTimeNeedleRef.current.style.display = "block";
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeNeedleRef.current) {
      hoverTimeNeedleRef.current.style.display = "none";
    }
  }, []);

  if (!minimapSpans.length) {
    return null;
  }

  return (
    <div className="h-full flex-none max-w-16 w-fit z-30 border-l">
      <div
        ref={minimapRef}
        className="pl-1 h-full py-1 no-scrollbar no-scrollbar::-webkit-scrollbar overflow-auto overflow-x-hidden flex space-x-1 relative"
        onScroll={handleMinimapScroll}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={sessionTimeNeedleRef}
          className="bg-primary absolute left-0 w-full h-px z-30"
          style={{ display: "none" }}
        />
        <div
          ref={hoverTimeNeedleRef}
          className="bg-primary absolute left-0 w-full h-px z-20 opacity-50 pointer-events-none"
          style={{ display: "none" }}
        />
        <div ref={spansContainerRef} className="relative w-2 flex-none cursor-pointer" onClick={handleMinimapClick}>
          {minimapSpans.map((span, index) => {
            const isVisible = tab === "reader" && visibleSpanIds.includes(span.spanId);
            return (
              <div
                style={{
                  top: span.y,
                  height: span.height,
                  left: 0,
                }}
                key={span.spanId}
                className={cn(
                  "bg-background absolute duration-100 transition-opacity",
                  tab === "reader"
                    ? isVisible
                      ? "opacity-100"
                      : "opacity-40 hover:opacity-100"
                    : "opacity-80 hover:opacity-100"
                )}
              >
                <div
                  className="w-2 cursor-pointer rounded-[2px] h-full transition-opacity"
                  style={{
                    backgroundColor: span.status === "error" ? "rgb(204, 51, 51)" : SPAN_TYPE_TO_COLOR[span.spanType],
                    marginTop: 2,
                    paddingBottom: 0,
                  }}
                  onClick={(e) => handleSpanClick(index, e)}
                />
              </div>
            );
          })}
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

export default memo(Minimap);
