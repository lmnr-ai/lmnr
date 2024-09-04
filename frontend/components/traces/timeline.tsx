import { useEffect, useRef, useState } from "react";
import { getDuration, getDurationString } from "@/lib/flow/utils";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { Table } from "../ui/table";
import { Span } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface TimelineProps {
  spans: Span[]
  childSpans: { [key: string]: Span[] }
}

interface SegmentEvent {
  id: string
  name: string
  left: number
}

interface Segment {
  left: number
  width: number
  span: Span
  events: SegmentEvent[]
}

export default function Timeline({ spans, childSpans }: TimelineProps) {

  const [segments, setSegments] = useState<Segment[]>([])
  const [timeIntervals, setTimeIntervals] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const traverse = (span: Span, childSpans: { [key: string]: Span[] }, orderedSpands: Span[]) => {

    if (!span) {
      return
    }

    orderedSpands.push(span)

    if (childSpans[span.spanId]) {
      for (const child of childSpans[span.spanId]) {
        traverse(child, childSpans, orderedSpands)
      }
    }
  }

  useEffect(() => {

    if (!ref.current || childSpans === null) {
      return
    }

    const componentWidth = ref.current.getBoundingClientRect().width

    if (componentWidth === 0) {
      return
    }

    const orderedSpans: Span[] = []
    const topLevelSpans = spans.filter(span => span.parentSpanId === null)

    for (const span of topLevelSpans) {
      traverse(span, childSpans, orderedSpans)
    }

    let startTime = null
    let endTime = null

    for (const span of spans) {

      const spanStartTime = new Date(span.startTime)
      const spanEndTime = new Date(span.endTime)

      if (!startTime) {
        startTime = spanStartTime
      }

      if (!endTime) {
        endTime = spanEndTime
      }

      if (spanStartTime < startTime) {
        startTime = spanStartTime
      }

      if (spanEndTime > endTime) {
        endTime = spanEndTime
      }
    }

    if (!startTime || !endTime) {
      return
    }

    const totalDuration = (endTime.getTime() - startTime.getTime())

    const upperInterval = Math.ceil(totalDuration / 1000)
    const unit = upperInterval / 10

    const timeIntervals = []
    for (let i = 0; i < 10; i++) {
      timeIntervals.push((i * unit).toFixed(2) + "s")
    }
    setTimeIntervals(timeIntervals)

    const segments: Segment[] = []

    for (const span of orderedSpans) {

      const duration = getDuration(span.startTime, span.endTime) / 1000

      const width = (duration / upperInterval) * 100
      const left = ((getDuration(startTime.toISOString(), span.startTime) / 1000) / upperInterval) * 100

      const segmentEvents = [] as SegmentEvent[]
      for (const event of span.events) {
        const eventLeft = ((new Date(event.timestamp)).getTime() - (new Date(span.startTime)).getTime()) / 1000 / duration * 100

        segmentEvents.push({
          id: event.id,
          name: event.templateName,
          left: eventLeft
        })
      }

      segments.push({
        left,
        width,
        span,
        events: segmentEvents
      })
    }

    setSegments(segments)

  }, [spans, childSpans])

  return (
    <div
      className="flex flex-col h-full w-full"
      ref={ref}
    >
      <div className="bg-background flex text-xs w-full border-b z-30 sticky top-0 h-12 px-4">
        {
          timeIntervals.map((interval, index) => (
            <div
              className="border-l text-secondary-foreground pl-1 flex items-center min-w-12 relative z-0"
              style={{ width: "10%" }}
              key={index}
            >
              {interval}
            </div>
          ))
        }
        <div className="border-r" />
      </div>
      <div className="px-4">
        <div
          className="flex flex-col space-y-1 w-full pt-[6px]"
        >
          {
            segments.map((segment, index) => (
              <div
                key={index}
                className={cn("rounded relative z-20", segment.span.spanType === "DEFAULT" ? "bg-blue-400" : "bg-purple-600")}
                style={
                  {
                    marginLeft: segment.left + "%",
                    width: segment.width + "%",
                    height: 24,
                  }
                }
              >
                {
                  segment.events.map((event, index) => (
                    <div
                      key={index}
                      className="absolute bg-orange-400 w-1 rounded"
                      style={{
                        left: event.left + "%",
                        top: -2,
                        height: 28
                      }}
                    />
                  ))
                }
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}