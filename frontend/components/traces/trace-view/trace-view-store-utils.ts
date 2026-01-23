import { isEmpty } from "lodash";

import { type TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { type SpanType } from "@/lib/traces/types.ts";
import { getDuration } from "@/lib/utils";

export type PathInfo = {
  display: Array<{ spanId: string; name: string; count?: number }>;
  full: Array<{ spanId: string; name: string }>;
} | null;

export interface TreeSpan {
  span: TraceViewSpan;
  depth: number;
  yOffset: number;
  parentY: number;
  pending: boolean;
  pathInfo: PathInfo;
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
  spanType: SpanType;
  spanId: string;
}

export const getChildSpansMap = <T extends TraceViewSpan>(spans: T[]): { [key: string]: T[] } => {
  const childSpans = {} as { [key: string]: T[] };

  for (const span of spans) {
    if (span.parentSpanId) {
      if (!childSpans[span.parentSpanId]) {
        childSpans[span.parentSpanId] = [];
      }
      childSpans[span.parentSpanId].push(span);
    }
  }

  return childSpans;
};

export const computePathInfoMap = (spans: TraceViewSpan[]): Map<string, PathInfo> => {
  // Build spanMap for parent lookups (needs ALL spans)
  const spanMap = new Map(
    spans.map((span) => [
      span.spanId,
      { spanId: span.spanId, name: span.name, parentSpanId: span.parentSpanId },
    ])
  );

  // Sections needed for display counts
  const nonDefaultSpans = spans.filter((span) => span.spanType !== "DEFAULT");
  const sections = groupIntoSections(nonDefaultSpans);
  const spanNameMap = buildSpanNameMap(sections, spanMap);

  // Compute pathInfo for each span
  const pathInfoMap = new Map<string, PathInfo>();
  for (const span of spans) {
    const parentChain = buildParentChain(span, spanMap);
    pathInfoMap.set(span.spanId, buildPathInfo(parentChain, spanNameMap));
  }

  return pathInfoMap;
};

export const transformSpansToTree = (spans: TraceViewSpan[], pathInfoMap?: Map<string, PathInfo>): TreeSpan[] => {
  const topLevelSpans = spans.filter((span) => !span.parentSpanId);
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
      pending: span.pending || false,
      pathInfo: pathInfoMap?.get(span.spanId) ?? null,
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
  if (spans.length === 0) {
    return {
      spans: [],
      startTime: 0,
      timeIntervals: [],
      timelineWidthInMilliseconds: 0,
    };
  }

  const childSpans = getChildSpansMap(spans);

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
  const topLevelSpans = spans.filter((span) => !span.parentSpanId);

  for (const span of topLevelSpans) {
    traverse(span, childSpans, orderedSpans);
  }

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

export const transformSpansToFlatMinimap = (spans: TraceViewSpan[], traceDuration: number): MinimapSpan[] => {
  const pixelsPerSecond = getMinimapPixelsPerSecond(traceDuration);

  if (isEmpty(spans)) return [];

  const minTime = Math.min(...spans.map((s) => new Date(s.startTime).getTime()));
  const MIN_H = 1;

  return spans.map((span) => {
    const startTime = new Date(span.startTime).getTime();
    const endTime = new Date(span.endTime).getTime();
    const spanDuration = (endTime - startTime) / 1000;
    const relativeStart = (startTime - minTime) / 1000;

    return {
      span,
      depth: 0,
      yOffset: 0,
      parentY: 0,
      pending: span.pending || false,
      pathInfo: null,
      y: relativeStart * pixelsPerSecond,
      height: Math.max(MIN_H, spanDuration * pixelsPerSecond),
      status: span.attributes?.status,
      spanType: span.spanType,
      spanId: span.spanId,
    };
  });
};

export const groupIntoSections = (listSpans: TraceViewSpan[]): TraceViewSpan[][] =>
  listSpans.reduce<TraceViewSpan[][]>((sections, span) => {
    const lastSection = sections[sections.length - 1];

    if (span.spanType === "LLM" && lastSection && lastSection.length > 0) {
      sections.push([span]);
    } else {
      if (!lastSection) {
        sections.push([span]);
      } else {
        lastSection.push(span);
      }
    }
    return sections;
  }, []);

const buildParentChainRecursive = (
  spanId: string,
  spanMap: Map<string, Pick<TraceViewSpan, "spanId" | "name" | "parentSpanId">>,
  chain: string[] = []
): string[] => {
  const span = spanMap.get(spanId);
  if (!span?.parentSpanId) {
    return chain;
  }

  const parentSpan = spanMap.get(span.parentSpanId);
  if (!parentSpan) {
    return chain;
  }

  return buildParentChainRecursive(parentSpan.spanId, spanMap, [parentSpan.spanId, ...chain]);
};

/**
 * Calculate occurrence counts [2], [3] for duplicate names within sections
 * Returns a Map of spanId -> structured data with name and optional count
 */
export const buildSpanNameMap = (
  sections: TraceViewSpan[][],
  spanMap: Map<string, Pick<TraceViewSpan, "spanId" | "name" | "parentSpanId">>
): Map<string, { name: string; count?: number }> => {
  const map = new Map<string, { name: string; count?: number }>();

  sections.forEach((section) => {
    const parentChains: string[][] = section.map((listSpan) => {
      const chain = [listSpan.spanId];
      const parentChain = buildParentChainRecursive(listSpan.spanId, spanMap);
      return [...parentChain, ...chain];
    });

    const commonParentIndex =
      parentChains.length > 0
        ? parentChains[0].reduce(
            (maxIndex, spanId, i) => (parentChains.every((chain) => chain[i] === spanId) ? i : maxIndex),
            0
          )
        : 0;

    const spansInContext = new Set<string>(parentChains.flatMap((chain) => chain.slice(commonParentIndex)));

    const nameCounter = new Map<string, number>();
    const sortedSpans = Array.from(spansInContext)
      .map((id) => spanMap.get(id))
      .filter((span): span is Pick<TraceViewSpan, "spanId" | "name" | "parentSpanId"> => span !== undefined);

    sortedSpans.forEach((span) => {
      const name = span.name;
      const currentCount = nameCounter.get(name) || 0;
      const count = currentCount + 1;
      nameCounter.set(name, count);

      map.set(span.spanId, count > 1 ? { name, count } : { name });
    });
  });

  return map;
};

export const buildParentChain = (
  span: TraceViewSpan,
  spanMap: Map<string, Pick<TraceViewSpan, "spanId" | "name" | "parentSpanId">>
): Array<{ spanId: string; name: string }> => {
  const parentChainIds = buildParentChainRecursive(span.spanId, spanMap);

  return parentChainIds
    .map((spanId) => {
      const parentSpan = spanMap.get(spanId);
      return parentSpan ? { spanId: parentSpan.spanId, name: parentSpan.name } : null;
    })
    .filter((ref): ref is { spanId: string; name: string } => ref !== null);
};

export const buildPathInfo = (
  parentChain: Array<{ spanId: string; name: string }>,
  spanNameMap: Map<string, { name: string; count?: number }>
): {
  display: Array<{ spanId: string; name: string; count?: number }>;
  full: Array<{ spanId: string; name: string }>;
} | null => {
  if (parentChain.length === 0) {
    return null;
  }

  const enrichedParents = parentChain.map((ref) => {
    const spanInfo = spanNameMap.get(ref.spanId);
    return {
      spanId: ref.spanId,
      name: spanInfo?.name || ref.name,
      count: spanInfo?.count,
    };
  });

  const displayPath =
    enrichedParents.length <= 3
      ? enrichedParents
      : [
          { spanId: "...", name: "..." },
          enrichedParents[enrichedParents.length - 2],
          enrichedParents[enrichedParents.length - 1],
        ];

  return {
    display: displayPath,
    full: parentChain,
  };
};
