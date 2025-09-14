import { isEmpty } from "lodash";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Span } from "@/lib/traces/types.ts";
import { getDuration } from "@/lib/utils";

export interface TreeSpan {
  span: TraceViewSpan;
  depth: number;
  yOffset: number;
  parentY: number;
}

export interface SegmentEvent {
  id: string;
  name: string;
  left: number;
}

interface TimelineSpan {
  left: number;
  width: number;
  span: TraceViewSpan;
  events: SegmentEvent[];
}

export interface TimelineData {
  spans: TimelineSpan[];
  startTime: number;
  timeIntervals: string[];
  timelineWidthInMilliseconds: number;
}

export interface MinimapSpan extends TreeSpan {
  y: number;
  height: number;
  status?: string;
  spanType: string;
  spanId: string;
}

export const getTopLevelSpans = <T extends Span>(spans: T[]): T[] =>
  spans
    .filter((span) => !span.parentSpanId)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

export const getChildSpansMap = <T extends Span>(spans: T[]): { [key: string]: T[] } => {
  const childSpans = {} as { [key: string]: T[] };

  for (const span of spans) {
    if (span.parentSpanId) {
      if (!childSpans[span.parentSpanId]) {
        childSpans[span.parentSpanId] = [];
      }
      childSpans[span.parentSpanId].push(span);
    }
  }

  for (const parentId in childSpans) {
    childSpans[parentId].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  return childSpans;
};

export const transformSpansToTree = (spans: TraceViewSpan[]): TreeSpan[] => {
  const topLevelSpans = getTopLevelSpans(spans);
  const childSpans = getChildSpansMap(spans);

  const spanItems: TreeSpan[] = [];
  const maxY = { current: 0 };

  const buildTreeWithCollapse = (
    items: TreeSpan[],
    span: TraceViewSpan,
    depth: number,
    maxY: { current: number },
    parentY: number
  ) => {
    const yOffset = maxY.current + 36;

    items.push({
      span,
      depth,
      yOffset,
      parentY,
    });

    maxY.current = maxY.current + 36;

    if (!span.collapsed) {
      const py = maxY.current;
      childSpans[span.spanId]?.forEach((child) => buildTreeWithCollapse(items, child, depth + 1, maxY, py));
    }
  };

  topLevelSpans.forEach((span) => buildTreeWithCollapse(spanItems, span, 0, maxY, 0));
  return spanItems;
};

const traverse = (
  span: TraceViewSpan,
  childSpans: { [key: string]: TraceViewSpan[] },
  orderedSpans: TraceViewSpan[]
) => {
  if (!span) return;
  orderedSpans.push(span);

  if (span.collapsed) return;

  if (childSpans[span.spanId]) {
    for (const child of childSpans[span.spanId]) {
      traverse(child, childSpans, orderedSpans);
    }
  }
};

export const transformSpansToTimeline = (spans: TraceViewSpan[]): TimelineData => {
  const childSpans = getChildSpansMap(spans);

  if (spans.length === 0) {
    return {
      spans: [],
      startTime: 0,
      timeIntervals: [],
      timelineWidthInMilliseconds: 0,
    };
  }

  // Traverse function to get ordered spans respecting collapsed state
  const traverse = (
    span: TraceViewSpan,
    childSpans: { [key: string]: TraceViewSpan[] },
    orderedSpans: TraceViewSpan[]
  ) => {
    if (!span) return;
    orderedSpans.push(span);

    if (span.collapsed) return;

    if (childSpans[span.spanId]) {
      for (const child of childSpans[span.spanId]) {
        traverse(child, childSpans, orderedSpans);
      }
    }
  };

  const orderedSpans: TraceViewSpan[] = [];
  const topLevelSpans = spans
    .filter((span) => span.parentSpanId === null)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  for (const span of topLevelSpans) {
    traverse(span, childSpans, orderedSpans);
  }

  orderedSpans.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (orderedSpans.length === 0) {
    return {
      spans: [],
      startTime: 0,
      timeIntervals: [],
      timelineWidthInMilliseconds: 0,
    };
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
  const segments: TimelineSpan[] = [];

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

  return {
    spans: segments,
    startTime,
    timeIntervals,
    timelineWidthInMilliseconds: upperIntervalInMilliseconds,
  };
};

const getMinimapPixelsPerSecond = (traceDuration: number): number => {
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
};

export const transformSpansToMinimap = (spans: TraceViewSpan[], traceDuration: number): MinimapSpan[] => {
  const spanItems = transformSpansToTree(spans);
  const pixelsPerSecond = getMinimapPixelsPerSecond(traceDuration);

  if (isEmpty(spanItems)) return [];

  const minTime = Math.min(...spanItems.map((s) => new Date(s.span.startTime).getTime()));
  const MIN_H = 1;

  return spanItems.map((s) => {
    const startTime = new Date(s.span.startTime).getTime();
    const endTime = new Date(s.span.endTime).getTime();
    const spanDuration = (endTime - startTime) / 1000; // Convert to seconds
    const relativeStart = (startTime - minTime) / 1000; // Convert to seconds

    return {
      ...s,
      y: relativeStart * pixelsPerSecond,
      height: Math.max(MIN_H, spanDuration * pixelsPerSecond),
      status: s.span.attributes?.status,
      spanType: s.span.spanType,
      spanId: s.span.spanId,
    };
  });
};
