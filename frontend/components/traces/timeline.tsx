import { useCallback, useEffect, useRef, useState } from 'react';

import { getDuration } from '@/lib/flow/utils';
import { Span } from '@/lib/traces/types';
import { SPAN_TYPE_TO_COLOR } from '@/lib/traces/utils';


interface TimelineProps {
  spans: Span[];
  childSpans: { [key: string]: Span[] };
  collapsedSpans: Set<string>;
  browserSessionTime: number | null;
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
  browserSessionTime
}: TimelineProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [timeIntervals, setTimeIntervals] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);

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
    if (!ref.current || childSpans === null) {
      return;
    }

    const componentWidth = ref.current.getBoundingClientRect().width;

    if (componentWidth === 0) {
      return;
    }

    const orderedSpans: Span[] = [];
    const topLevelSpans = spans.filter((span) => span.parentSpanId === null);

    for (const span of topLevelSpans) {
      traverse(span, childSpans, orderedSpans);
    }

    let startTime = null;
    let endTime = null;

    for (const span of spans) {
      const spanStartTime = new Date(span.startTime);
      const spanEndTime = new Date(span.endTime);

      if (!startTime) {
        startTime = spanStartTime;
      }

      if (!endTime) {
        endTime = spanEndTime;
      }

      if (spanStartTime < startTime) {
        startTime = spanStartTime;
      }

      if (spanEndTime > endTime) {
        endTime = spanEndTime;
      }
    }

    if (!startTime || !endTime) {
      return;
    }

    setStartTime(startTime.getTime());
    setEndTime(endTime.getTime());

    const totalDuration = endTime.getTime() - startTime.getTime();

    const upperInterval = Math.ceil(totalDuration / 1000);
    const unit = upperInterval / 10;

    const timeIntervals = [];
    for (let i = 0; i < 10; i++) {
      timeIntervals.push((i * unit).toFixed(2) + 's');
    }
    setTimeIntervals(timeIntervals);

    const segments: Segment[] = [];

    for (const span of orderedSpans) {
      const spanDuration = getDuration(span.startTime, span.endTime);

      const width = (spanDuration / totalDuration) * 100;

      const left = (new Date(span.startTime).getTime() - startTime.getTime()) / totalDuration * 100;

      console.log("spanDuration", spanDuration, "span offset", left, span.startTime, new Date(span.startTime).getTime());

      const segmentEvents = [] as SegmentEvent[];

      for (const event of span.events) {
        const eventLeft =
          ((new Date(event.timestamp).getTime() -
            new Date(span.startTime).getTime()) /
            1000 /
            spanDuration) *
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
      <div className="bg-background flex text-xs w-full border-b z-40 sticky top-0 h-12 px-4">
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
      </div>
      <div className="px-4">
        <div className="flex flex-col space-y-1 w-full pt-[2px] relative">
          {browserSessionTime && (
            <div className="absolute -top-32 h-full bg-primary z-50 w-[1px]"
              style={{
                left: ((browserSessionTime - startTime) / (endTime - startTime)) * 100 + '%'
              }}
            />
          )}
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
