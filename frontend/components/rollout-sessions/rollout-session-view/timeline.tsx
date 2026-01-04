import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty } from "lodash";
import React, { memo, useEffect, useMemo, useRef } from "react";

import { TraceViewSpan, useRolloutSessionStore, useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store.tsx";
import TimelineElement from "@/components/rollout-sessions/rollout-session-view/timeline-element";
import { Skeleton } from "@/components/ui/skeleton.tsx";

interface TimelineProps {
  onSetCachePoint?: (span: TraceViewSpan) => void;
  onUnlock?: (span: TraceViewSpan) => void;
  isSpanCached?: (span: TraceViewSpan) => boolean;
}

function Timeline({ onSetCachePoint, onUnlock, isSpanCached }: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const sessionTimeNeedleRef = useRef<HTMLDivElement>(null);

  const {
    getTimelineData,
    zoom,
    spans: storeSpans,
    selectedSpan,
    setSelectedSpan,
    isSpansLoading,
    browserSession,
  } = useRolloutSessionStoreContext((state) => ({
    getTimelineData: state.getTimelineData,
    spans: state.spans,
    zoom: state.zoom,
    selectedSpan: state.selectedSpan,
    setSelectedSpan: state.setSelectedSpan,
    isSpansLoading: state.isSpansLoading,
    browserSession: state.browserSession,
  }));

  const store = useRolloutSessionStore();

  const { spans, timeIntervals, timelineWidthInMilliseconds } = useMemo(
    () => getTimelineData(),
    [getTimelineData, storeSpans]
  );

  const virtualizer = useVirtualizer({
    count: spans.length,
    getScrollElement: () => ref.current,
    estimateSize: () => 32, // HEIGHT + margin
    overscan: 100,
  });

  useEffect(() => {
    const currentSessionTime = store.getState().sessionTime || 0;
    if (sessionTimeNeedleRef.current && timelineWidthInMilliseconds > 0) {
      const leftPosition = ((currentSessionTime * 1000) / timelineWidthInMilliseconds) * 100;
      sessionTimeNeedleRef.current.style.left = `${Math.max(0, Math.min(100, leftPosition))}%`;
      sessionTimeNeedleRef.current.style.display = browserSession && currentSessionTime ? "block" : "none";
    }

    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.sessionTime !== prevState.sessionTime || state.browserSession !== prevState.browserSession) {
        const sessionTime = state.sessionTime || 0;
        if (sessionTimeNeedleRef.current && timelineWidthInMilliseconds > 0) {
          const leftPosition = ((sessionTime * 1000) / timelineWidthInMilliseconds) * 100;
          sessionTimeNeedleRef.current.style.left = `${Math.max(0, Math.min(100, leftPosition))}%`;
          sessionTimeNeedleRef.current.style.display = state.browserSession && sessionTime ? "block" : "none";
        }
      }
    });

    return unsubscribe;
  }, [store, timelineWidthInMilliseconds, browserSession]);

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
    <div className="flex flex-1 overflow-hidden">
      <div className="h-full w-full relative overflow-auto styled-scrollbar" ref={ref}>
        <div
          style={{ width: `${100 * zoom}%` }}
          className="sticky top-0 z-20 bg-background flex flex-1 text-xs border-b h-8 px-4"
        >
          <div
            ref={sessionTimeNeedleRef}
            className="absolute top-0 bg-primary z-50 w-px"
            style={{
              display: "none",
              height: virtualizer.getTotalSize() + 32,
            }}
          />
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
                onSetCachePoint={onSetCachePoint}
                onUnlock={onUnlock}
                isCached={isSpanCached?.(spans[virtualRow.index].span)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(Timeline);
