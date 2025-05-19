import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import TimelineElement from "@/components/traces/trace-view/timeline-element";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { getDuration } from "@/lib/flow/utils";
import { Span } from "@/lib/traces/types";

interface TimelineProps {
  spans: Span[];
  childSpans: { [key: string]: Span[] };
  collapsedSpans: Set<string>;
  browserSessionTime: number | null;
  zoomLevel: number;
  selectedSpan: Span | null;
  setSelectedSpan: (span: Span | null) => void;
}

interface SegmentEvent {
  id: string;
  name: string;
  left: number;
}

interface Segment {
  left: number;
  width: number;
  span: Span;
  events: SegmentEvent[];
}

interface TimelineData {
  segments: Segment[];
  startTime: number;
  timeIntervals: string[];
  timelineWidthInMilliseconds: number;
}

function Timeline({
  spans,
  selectedSpan,
  childSpans,
  collapsedSpans,
  browserSessionTime,
  zoomLevel,
  setSelectedSpan,
}: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [timelineData, setTimelineData] = useState<TimelineData>({
    segments: [],
    startTime: 0,
    timeIntervals: [],
    timelineWidthInMilliseconds: 0,
  });

  const { segments, startTime, timeIntervals, timelineWidthInMilliseconds } = timelineData;

  const traverse = useCallback(
    (span: Span, childSpans: { [key: string]: Span[] }, orderedSpans: Span[]) => {
      if (!span) {
        return;
      }
      orderedSpans.push(span);

      if (collapsedSpans.has(span.spanId)) {
        return;
      }

      if (childSpans[span.spanId]) {
        for (const child of childSpans[span.spanId]) {
          traverse(child, childSpans, orderedSpans);
        }
      }
    },
    [collapsedSpans]
  );

  // Use useEffect instead of useMemo for DOM measurements and state updates
  useEffect(() => {
    if (!ref.current || childSpans === null || spans.length === 0) {
      return;
    }

    const componentWidth = ref.current.getBoundingClientRect().width;

    if (componentWidth === 0) {
      return;
    }

    const orderedSpans: Span[] = [];
    const topLevelSpans = spans
      .filter((span) => span.parentSpanId === null)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    for (const span of topLevelSpans) {
      traverse(span, childSpans, orderedSpans);
    }

    if (orderedSpans.length === 0) {
      return;
    }

    let startTime = Infinity;
    let endTime = -Infinity;

    for (const span of orderedSpans) {
      startTime = Math.min(startTime, new Date(span.startTime).getTime());
      endTime = Math.max(endTime, new Date(span.endTime).getTime());
    }

    const totalDuration = endTime - startTime;

    const upperIntervalInSeconds = Math.ceil(totalDuration / 1000);
    const unit = upperIntervalInSeconds / 10;

    const timeIntervals = [];
    for (let i = 0; i < 10; i++) {
      timeIntervals.push((i * unit).toFixed(2) + "s");
    }

    const upperIntervalInMilliseconds = upperIntervalInSeconds * 1000;

    const segments: Segment[] = [];

    for (const span of orderedSpans) {
      const spanDuration = getDuration(span.startTime, span.endTime);

      const width = (spanDuration / upperIntervalInMilliseconds) * 100;

      const left = ((new Date(span.startTime).getTime() - startTime) / upperIntervalInMilliseconds) * 100;

      const segmentEvents = [] as SegmentEvent[];

      for (const event of span.events) {
        const eventLeft =
          ((new Date(event.timestamp).getTime() - new Date(span.startTime).getTime()) / upperIntervalInMilliseconds) *
          100;

        segmentEvents.push({
          id: event.id,
          name: event.name,
          left: eventLeft,
        });
      }

      segments.push({
        left,
        width,
        span,
        events: segmentEvents,
      });
    }

    setTimelineData({
      segments,
      startTime,
      timeIntervals,
      timelineWidthInMilliseconds: upperIntervalInMilliseconds,
    });
  }, [spans, childSpans, collapsedSpans, traverse]);

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => ref.current,
    estimateSize: () => 32, // HEIGHT + margin
    overscan: 50,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <ScrollArea className="h-full w-full relative" ref={ref}>
      {browserSessionTime && (
        <div
          className="absolute top-0 bg-primary z-30 h-full w-[1px]"
          style={{
            left: ((browserSessionTime - startTime) / timelineWidthInMilliseconds) * 100 + "%",
          }}
        />
      )}
      <div style={{ width: `${100 * zoomLevel}%` }} className="bg-background flex flex-1 text-xs border-b h-8 px-4">
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
      <div style={{ height: virtualizer.getTotalSize(), width: `${100 * zoomLevel}%` }}>
        <div
          className="overflow-hidden"
          style={{
            position: "relative",
            height: virtualizer.getTotalSize(),
          }}
        >
          <div className="absolute inset-0 pointer-events-none">
            {timeIntervals.map((_, index) => (
              <div
                key={index}
                className="absolute top-0 bottom-0 border-l border-secondary-foreground/20"
                style={{
                  left: `calc(${(index * 10) / 100} * (100% - 32px) + 16px)`,
                }}
              />
            ))}
            <div
              className="absolute top-0 bottom-0 border-r border-secondary-foreground/20"
              style={{ right: "16px" }}
            />
          </div>
          {items.map((virtualRow) => (
            <TimelineElement
              key={virtualRow.key}
              selectedSpan={selectedSpan}
              setSelectedSpan={setSelectedSpan}
              segment={segments[virtualRow.index]}
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
