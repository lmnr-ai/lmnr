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
  branchMask: boolean[]; // branchMask[d] = true if ancestor at depth d has more children below
  pending: boolean;
  pathInfo: PathInfo;
  // Keep yOffset/parentY for backward compatibility (minimap uses them)
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
    spans.map((span) => [span.spanId, { spanId: span.spanId, name: span.name, parentSpanId: span.parentSpanId }])
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

  // Track which ancestor depths have more children to render
  const activeAncestors: boolean[] = [];

  const buildTreeWithCollapse = (
    items: TreeSpan[],
    span: TraceViewSpan,
    depth: number,
    maxY: { current: number },
    parentY: number
  ) => {
    const yOffset = maxY.current + 36;

    // Capture branchMask as snapshot of active ancestors for depths 0 to depth-1
    const branchMask = activeAncestors.slice(0, depth);

    items.push({
      span,
      depth,
      branchMask,
      yOffset,
      parentY,
      pending: span.pending || false,
      pathInfo: pathInfoMap?.get(span.spanId) ?? null,
    });

    maxY.current = maxY.current + 36;

    if (!span.collapsed) {
      const children = childSpans[span.spanId] || [];
      const py = maxY.current;

      children.forEach((child, index) => {
        const isLastChild = index === children.length - 1;

        // Ensure array is long enough
        while (activeAncestors.length <= depth) {
          activeAncestors.push(false);
        }

        // Set whether this depth has more siblings coming
        activeAncestors[depth] = !isLastChild;

        buildTreeWithCollapse(items, child, depth + 1, maxY, py);
      });

      // Clear this depth when done
      if (activeAncestors.length > depth) {
        activeAncestors[depth] = false;
      }
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
      branchMask: [],
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

// ============================================================================
// Condensed Timeline Types and Functions
// ============================================================================

export interface CondensedTimelineSpan {
  span: TraceViewSpan;
  left: number; // percentage (0-100)
  width: number; // percentage (0-100)
  row: number; // computed row after gravity
  originalDepth: number; // tree depth before condensing
  parentSpanId?: string;
}

export interface CondensedTimelineData {
  spans: CondensedTimelineSpan[];
  startTime: number;
  endTime: number;
  totalRows: number;
  timelineWidthInMilliseconds: number;
  totalDurationMs: number;
}

/**
 * Computes the visible span IDs by adding all ancestors of selected spans.
 * This ensures tree views maintain hierarchy when filtering.
 */
export const computeVisibleSpanIds = (
  selectedIds: Set<string>,
  spans: TraceViewSpan[]
): Set<string> => {
  if (selectedIds.size === 0) return new Set();

  const visibleIds = new Set(selectedIds);
  const spanMap = new Map(spans.map((s) => [s.spanId, s]));

  // For each selected span, walk up to root adding ancestors
  for (const spanId of selectedIds) {
    let current = spanMap.get(spanId);
    while (current?.parentSpanId) {
      visibleIds.add(current.parentSpanId);
      current = spanMap.get(current.parentSpanId);
    }
  }

  return visibleIds;
};

/**
 * Transforms spans into a condensed timeline layout using a gravity algorithm.
 * Spans are compacted vertically while maintaining the parent-child hierarchy invariant
 * (children never appear above their parents).
 */
export const transformSpansToCondensedTimeline = (spans: TraceViewSpan[]): CondensedTimelineData => {
  if (spans.length === 0) {
    return {
      spans: [],
      startTime: 0,
      endTime: 0,
      totalRows: 0,
      timelineWidthInMilliseconds: 0,
      totalDurationMs: 0,
    };
  }

  // Calculate time bounds
  let startTime = Infinity;
  let endTime = -Infinity;

  for (const span of spans) {
    startTime = Math.min(startTime, new Date(span.startTime).getTime());
    endTime = Math.max(endTime, new Date(span.endTime).getTime());
  }

  const totalDuration = endTime - startTime;
  const upperIntervalInSeconds = Math.ceil(totalDuration / 1000);
  const upperIntervalInMilliseconds = upperIntervalInSeconds * 1000;

  // Build parent lookup and compute original tree depths
  const spanMap = new Map(spans.map((s) => [s.spanId, s]));
  const childSpansMap = getChildSpansMap(spans);

  // Compute original depths using DFS from root spans
  const depthMap = new Map<string, number>();
  const computeDepth = (spanId: string, depth: number) => {
    depthMap.set(spanId, depth);
    const children = childSpansMap[spanId] || [];
    for (const child of children) {
      computeDepth(child.spanId, depth + 1);
    }
  };

  const topLevelSpans = spans.filter((span) => !span.parentSpanId);
  for (const span of topLevelSpans) {
    computeDepth(span.spanId, 0);
  }

  // Calculate positions for each span
  const spansWithPosition: Array<{
    span: TraceViewSpan;
    left: number;
    width: number;
    originalDepth: number;
    startMs: number;
    endMs: number;
  }> = [];

  for (const span of spans) {
    const spanStartMs = new Date(span.startTime).getTime();
    const spanEndMs = new Date(span.endTime).getTime();
    const spanDuration = spanEndMs - spanStartMs;

    const left = ((spanStartMs - startTime) / upperIntervalInMilliseconds) * 100;
    const width = (spanDuration / upperIntervalInMilliseconds) * 100;

    spansWithPosition.push({
      span,
      left,
      width: Math.max(width, 0.5), // Minimum width for visibility
      originalDepth: depthMap.get(span.spanId) ?? 0,
      startMs: spanStartMs,
      endMs: spanEndMs,
    });
  }

  // Use DFS order to process spans (parent before children) instead of sorting by start time
  const orderedSpans: typeof spansWithPosition = [];
  const visited = new Set<string>();

  const dfsOrder = (spanId: string) => {
    if (visited.has(spanId)) return;
    visited.add(spanId);

    const spanWithPos = spansWithPosition.find((s) => s.span.spanId === spanId);
    if (spanWithPos) {
      orderedSpans.push(spanWithPos);
    }

    // Process children in order
    const children = childSpansMap[spanId] || [];
    for (const child of children) {
      dfsOrder(child.spanId);
    }
  };

  // Start from top-level spans
  for (const span of topLevelSpans) {
    dfsOrder(span.spanId);
  }

  // Gravity algorithm: compact spans upward while respecting parent-child invariant
  const rowAssignments = new Map<string, number>();
  const rowOccupancy: Array<Array<{ left: number; right: number; spanId: string }>> = [];

  // Helper to check if a span overlaps with any existing span in a row
  const hasOverlap = (row: number, left: number, right: number, excludeSpanId?: string): boolean => {
    if (!rowOccupancy[row]) return false;
    return rowOccupancy[row].some(
      (occupant) => occupant.spanId !== excludeSpanId && !(right <= occupant.left || left >= occupant.right)
    );
  };

  // Helper to get parent's row (returns -1 if no parent)
  const getParentRow = (spanId: string): number => {
    const span = spanMap.get(spanId);
    if (!span?.parentSpanId) return -1;
    return rowAssignments.get(span.parentSpanId) ?? -1;
  };

  for (const item of orderedSpans) {
    const parentRow = getParentRow(item.span.spanId);
    const minRow = parentRow + 1; // Child must be at least one row below parent

    // Find the lowest valid row (closest to top)
    let targetRow = minRow;
    const leftBound = item.left;
    const rightBound = item.left + item.width;

    while (hasOverlap(targetRow, leftBound, rightBound)) {
      targetRow++;
    }

    // Assign the row
    rowAssignments.set(item.span.spanId, targetRow);

    // Mark the row as occupied
    if (!rowOccupancy[targetRow]) {
      rowOccupancy[targetRow] = [];
    }
    rowOccupancy[targetRow].push({
      left: leftBound,
      right: rightBound,
      spanId: item.span.spanId,
    });
  }

  // Build final result
  const condensedSpans: CondensedTimelineSpan[] = orderedSpans.map((item) => ({
    span: item.span,
    left: item.left,
    width: item.width,
    row: rowAssignments.get(item.span.spanId) ?? 0,
    originalDepth: item.originalDepth,
    parentSpanId: item.span.parentSpanId,
  }));

  const totalRows = rowOccupancy.length;

  return {
    spans: condensedSpans,
    startTime,
    endTime,
    totalRows,
    timelineWidthInMilliseconds: upperIntervalInMilliseconds,
    totalDurationMs: totalDuration,
  };
};
