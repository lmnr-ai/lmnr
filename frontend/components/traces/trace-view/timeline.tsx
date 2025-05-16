import { useVirtualizer } from "@tanstack/react-virtual";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";

import { getDuration } from "@/lib/flow/utils";
import { Span } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineProps {
  spans: Span[];
  childSpans: { [key: string]: Span[] };
  collapsedSpans: Set<string>;
  browserSessionTime: number | null;
  containerHeight: number;
  scrollRef: RefObject<HTMLDivElement | null>;
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

const HEIGHT = 32;

export default function Timeline({
  spans,
  childSpans,
  collapsedSpans,
  browserSessionTime,
  containerHeight,
  scrollRef,
}: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [timelineData, setTimelineData] = useState<TimelineData>({
    segments: [],
    startTime: 0,
    timeIntervals: [],
    timelineWidthInMilliseconds: 0,
  });

  const { segments, startTime, timeIntervals, timelineWidthInMilliseconds } = timelineData;

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.5, 0.5));
  };

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
    <div className="flex flex-col h-full w-full relative">
      <ScrollArea className="h-full w-full" ref={ref}>
        <div className="bg-background flex text-xs border-b z-50 top-0 h-8 px-4 sticky">
          <div className="flex relative w-full">
            {timeIntervals.map((interval, index) => (
              <div
                className="relative z-0"
                style={{ width: "10%" }}
                key={index}
              >
                <div className="border-l text-secondary-foreground pl-1 truncate flex items-center min-w-12 h-8">
                  {interval}
                </div>
                <div
                  className="absolute top-8 border-l border-secondary-foreground/20 h-[2000px]"
                  style={{ left: 0 }}
                />
              </div>
            ))}
            <div className="border-r" />
            {browserSessionTime && (
              <div
                className="absolute top-0 bg-primary z-50 w-[1px]"
                style={{
                  left: ((browserSessionTime - startTime) / timelineWidthInMilliseconds) * 100 + "%",
                  height: containerHeight,
                }}
              />
            )}
          </div>
        </div>
        <div style={{ height: virtualizer.getTotalSize() }}>
          <div
            style={{
              position: "relative",
              height: virtualizer.getTotalSize(),
              width: `${100 * zoomLevel}%`,
            }}
          >
            {items.map((virtualRow) => {
              const segment = segments[virtualRow.index];
              if (!segment) return null; // Safety check

              return (
                <div
                  key={virtualRow.index}
                  data-index={virtualRow.index}
                  className={cn(
                    "absolute top-0 left-0 w-full h-8 flex items-center px-4",
                    virtualRow.index % 2 === 0 ? "bg-secondary-foreground/5" : "bg-secondary-foreground/10"
                  )}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className="rounded relative z-20 flex items-center"
                    style={{
                      backgroundColor: SPAN_TYPE_TO_COLOR[segment.span.spanType],
                      marginLeft: segment.left + "%",
                      width: `max(${segment.width}%, 2px)`,
                      height: 28,
                    }}
                  >
                    {segment.events.map((event, index) => (
                      <div
                        key={index}
                        className="absolute bg-orange-400 w-1 rounded"
                        style={{
                          left: event.left + "%",
                          top: 0,
                          height: HEIGHT,
                        }}
                      />
                    ))}
                    <div className="text-xs font-medium text-white/90 truncate absolute">
                      {segment.span.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
