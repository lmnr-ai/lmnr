import { useCallback, useEffect, useRef, useState } from 'react';

import { getDuration } from '@/lib/flow/utils';
import { Span } from '@/lib/traces/types';
import { SPAN_TYPE_TO_COLOR } from '@/lib/traces/utils';


interface TimelineProps {
  spans: Span[];
  childSpans: { [key: string]: Span[] };
  collapsedSpans: Set<string>;
  browserSessionTime: number | null;
  containerHeight: number;
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

const HEIGHT = 32;

export default function Timeline({
  spans,
  childSpans,
  collapsedSpans,
  browserSessionTime,
  containerHeight
}: TimelineProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [timeIntervals, setTimeIntervals] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [timelineWidthInMilliseconds, setTimelineWidthInMilliseconds] = useState<number>(0);

  const ref = useRef<HTMLDivElement>(null);

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

    setStartTime(startTime);

    const totalDuration = endTime - startTime;

    const upperIntervalInSeconds = Math.ceil(totalDuration / 1000);
    const unit = upperIntervalInSeconds / 10;

    const timeIntervals = [];
    for (let i = 0; i < 10; i++) {
      timeIntervals.push((i * unit).toFixed(2) + 's');
    }
    setTimeIntervals(timeIntervals);

    const upperIntervalInMilliseconds = upperIntervalInSeconds * 1000;
    setTimelineWidthInMilliseconds(upperIntervalInMilliseconds);

    const segments: Segment[] = [];

    for (const span of orderedSpans) {
      const spanDuration = getDuration(span.startTime, span.endTime);

      const width = (spanDuration / upperIntervalInMilliseconds) * 100;

      const left = (new Date(span.startTime).getTime() - startTime) / upperIntervalInMilliseconds * 100;

      const segmentEvents = [] as SegmentEvent[];

      for (const event of span.events) {
        const eventLeft =
          ((new Date(event.timestamp).getTime() -
            new Date(span.startTime).getTime()) /
            upperIntervalInMilliseconds) *
          100;

        segmentEvents.push({
          id: event.id,
          name: event.name,
          left: eventLeft
        });
      }

      segments.push({
        left,
        width,
        span,
        events: segmentEvents
      });
    }

    setSegments(segments);
  }, [spans, childSpans, collapsedSpans]);

  return (
    <div className="flex flex-col h-full w-full relative" ref={ref}>
      <div className="bg-background flex text-xs w-full border-b z-30 sticky top-0 h-12 px-4">
        <div className="flex w-full relative">
          {timeIntervals.map((interval, index) => (
            <div
              className="border-l text-secondary-foreground pl-1 flex items-center min-w-12 relative z-0"
              style={{ width: '10%' }}
              key={index}
            >
              {interval}
            </div>
          ))}
          <div className="border-r" />
          {browserSessionTime && (
            <div className="absolute top-0 bg-primary z-50 w-[1px]"
              style={{
                left: ((browserSessionTime - startTime) / timelineWidthInMilliseconds) * 100 + '%',
                height: containerHeight
              }}
            />
          )}
        </div>
      </div>
      <div className="px-4">
        <div className="flex flex-col space-y-1 w-full pt-[6px] relative">
          {segments.map((segment, index) => (
            <div
              key={index}
              className="relative border-secondary-foreground/20"
              style={{
                height: HEIGHT
              }}
            >
              <div
                className="rounded relative z-20"
                style={{
                  backgroundColor: SPAN_TYPE_TO_COLOR[segment.span.spanType],
                  marginLeft: segment.left + '%',
                  width: 'max(' + segment.width + '%, 2px)',
                  height: HEIGHT
                }}
              >
                {segment.events.map((event, index) => (
                  <div
                    key={index}
                    className="absolute bg-orange-400 w-1 rounded"
                    style={{
                      left: event.left + '%',
                      top: 0,
                      height: HEIGHT
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
