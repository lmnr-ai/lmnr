import { type TraceViewListSpan, type TraceViewSpan, type TranscriptListEntry } from "./types";

export type PathInfo = {
  display: Array<{ spanId: string; name: string; count?: number }>;
  full: Array<{ spanId: string; name: string }>;
} | null;

export interface TreeSpan {
  span: TraceViewSpan;
  depth: number;
  branchMask: boolean[]; // branchMask[d] = true if ancestor at depth d has more children below
  hasChildren: boolean; // structural children exist (independent of collapse / content-expandability)
  pending: boolean;
  pathInfo: PathInfo;
  // Keep yOffset/parentY for backward compatibility (minimap uses them)
  yOffset: number;
  parentY: number;
}

const getChildSpansMap = <T extends TraceViewSpan>(spans: T[]): { [key: string]: T[] } => {
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

  // Memoize parent chains so siblings reuse one walk and the two consumers
  // below (buildSpanNameMap + the pathInfo loop) don't each pay the full cost.
  const parentChainCache = new Map<string, string[]>();
  const getParentIds = (spanId: string): string[] => {
    const cached = parentChainCache.get(spanId);
    if (cached) return cached;
    const span = spanMap.get(spanId);
    const parent = span?.parentSpanId ? spanMap.get(span.parentSpanId) : undefined;
    const result = parent ? [...getParentIds(parent.spanId), parent.spanId] : [];
    parentChainCache.set(spanId, result);
    return result;
  };

  const nonDefaultSpans = spans.filter((span) => span.spanType !== "DEFAULT");
  const sections = groupIntoSections(nonDefaultSpans);
  const spanNameMap = buildSpanNameMap(sections, spanMap, getParentIds);

  const pathInfoMap = new Map<string, PathInfo>();
  for (const span of spans) {
    const parentIds = getParentIds(span.spanId);
    const parentChain = parentIds
      .map((id) => {
        const parent = spanMap.get(id);
        return parent ? { spanId: parent.spanId, name: parent.name } : null;
      })
      .filter((ref): ref is { spanId: string; name: string } => ref !== null);
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
      hasChildren: (childSpans[span.spanId]?.length ?? 0) > 0,
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

const groupIntoSections = (listSpans: TraceViewSpan[]): TraceViewSpan[][] =>
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

/**
 * Calculate occurrence counts [2], [3] for duplicate names within sections.
 * Returns a Map of spanId -> structured data with name and optional count.
 */
const buildSpanNameMap = (
  sections: TraceViewSpan[][],
  spanMap: Map<string, Pick<TraceViewSpan, "spanId" | "name" | "parentSpanId">>,
  getParentIds: (spanId: string) => string[]
): Map<string, { name: string; count?: number }> => {
  const map = new Map<string, { name: string; count?: number }>();

  sections.forEach((section) => {
    const parentChains: string[][] = section.map((listSpan) => [...getParentIds(listSpan.spanId), listSpan.spanId]);

    const commonParentIndex =
      parentChains.length > 0
        ? parentChains[0].reduce(
            (maxIndex, spanId, i) => (parentChains.every((chain) => chain[i] === spanId) ? i : maxIndex),
            0
          )
        : 0;

    const spansInContext = new Set<string>(parentChains.flatMap((chain) => chain.slice(commonParentIndex)));

    const nameCounter = new Map<string, number>();
    for (const id of spansInContext) {
      const span = spanMap.get(id);
      if (!span) continue;
      const count = (nameCounter.get(span.name) ?? 0) + 1;
      nameCounter.set(span.name, count);
      map.set(span.spanId, count > 1 ? { name: span.name, count } : { name: span.name });
    }
  });

  return map;
};

const buildPathInfo = (
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
// Transcript List
// ============================================================================

export const toLightweight = (span: TraceViewSpan): TraceViewListSpan => ({
  spanId: span.spanId,
  parentSpanId: span.parentSpanId,
  spanType: span.spanType,
  name: span.name,
  model: span.model,
  path: span.path,
  startTime: span.startTime,
  endTime: span.endTime,
  inputTokens: span.inputTokens,
  outputTokens: span.outputTokens,
  cacheReadInputTokens: span.cacheReadInputTokens,
  totalCost: span.totalCost,
  pending: span.pending,
  status: span.status,
  inputSnippet: span.inputSnippet,
  outputSnippet: span.outputSnippet,
  attributesSnippet: span.attributesSnippet,
});

const isLlmSpan = (span: TraceViewSpan): boolean => span.spanType === "LLM" || span.spanType === "CACHED";

export interface CondensedSubagentGroup {
  /** Matches transcriptExpandedGroups keys (`group-<toolSpanId>`). */
  groupId: string;
  /** The TOOL span that ran the subagent. It is the parent agent's call-site, so not a member. */
  toolSpanId: string;
  /** All span IDs belonging to this subagent group (any span type), in input order. */
  spanIds: string[];
}

/**
 * Groups spans by the subagent that produced them. Every agent integration we
 * instrument (Claude Agent SDK, OpenAI Agents `asTool`, Google ADK `AgentTool`,
 * AI SDK, LangChain / deepagents, Mastra, Pydantic AI, MS Agent Framework) runs
 * a spawned subagent inside the parent's tool call, so a subagent is a TOOL span
 * with LLM/CACHED descendants and its group is every descendant of that span.
 * Handoffs (OpenAI Agents, ADK `transfer_to_agent`, LangGraph supervisor) run the
 * next agent beside the tool rather than under it, so they stay inline.
 *
 * Only the outermost spawns become groups because the transcript renders one
 * level; a nested subagent stays inside its parent's group. When every LLM sits
 * under spawn tools, no calling agent is visible at that level (e.g. the whole
 * agent runs inside a tool span), so that layer is peeled and the search
 * continues inside it.
 */
export const computeSubagentGroups = (allSpans: TraceViewSpan[]): CondensedSubagentGroup[] => {
  const presentIds = new Set(allSpans.map((s) => s.spanId));
  const childSpans = getChildSpansMap(allSpans);
  const children = (span: TraceViewSpan): TraceViewSpan[] => childSpans[span.spanId] ?? [];

  // LLM/CACHED spans in each subtree, the span itself included.
  const llmCounts = new Map<string, number>();
  const countLlms = (span: TraceViewSpan): number => {
    const cached = llmCounts.get(span.spanId);
    if (cached !== undefined) return cached;
    let count = isLlmSpan(span) ? 1 : 0;
    for (const child of children(span)) count += countLlms(child);
    llmCounts.set(span.spanId, count);
    return count;
  };
  const sumLlms = (spans: TraceViewSpan[]) => spans.reduce((sum, s) => sum + countLlms(s), 0);

  const collectOutermostSpawns = (span: TraceViewSpan, out: TraceViewSpan[]) => {
    if (span.spanType === "TOOL" && countLlms(span) > 0) {
      out.push(span);
      return;
    }
    for (const child of children(span)) collectOutermostSpawns(child, out);
  };

  let scope = allSpans.filter((s) => !s.parentSpanId || !presentIds.has(s.parentSpanId));
  let spawns: TraceViewSpan[];
  for (;;) {
    spawns = [];
    for (const span of scope) collectOutermostSpawns(span, spawns);
    if (spawns.length === 0) return [];
    if (sumLlms(spawns) < sumLlms(scope)) break;
    scope = spawns.flatMap(children);
  }

  const spanToTool = new Map<string, string>();
  const claimDescendants = (span: TraceViewSpan, toolSpanId: string) => {
    for (const child of children(span)) {
      spanToTool.set(child.spanId, toolSpanId);
      claimDescendants(child, toolSpanId);
    }
  };
  for (const spawn of spawns) claimDescendants(spawn, spawn.spanId);

  const groupSpanIds = new Map<string, string[]>(spawns.map((s) => [s.spanId, []]));
  for (const span of allSpans) {
    const toolSpanId = spanToTool.get(span.spanId);
    if (toolSpanId) groupSpanIds.get(toolSpanId)!.push(span.spanId);
  }

  return spawns.map((spawn) => ({
    groupId: `group-${spawn.spanId}`,
    toolSpanId: spawn.spanId,
    spanIds: groupSpanIds.get(spawn.spanId)!,
  }));
};

/**
 * Builds the flat list of transcript entries. Spans inside a subagent (see
 * `computeSubagentGroups`) render as one group block at the position of the
 * group's first span; everything else renders inline.
 */
export const buildTranscriptListEntries = (
  allSpans: TraceViewSpan[],
  visibleSpanIds: Set<string>
): TranscriptListEntry[] => {
  const selectionFilteredSpans =
    visibleSpanIds.size === 0 ? allSpans : allSpans.filter((s) => visibleSpanIds.has(s.spanId));

  const listSpans = selectionFilteredSpans.filter((span) => span.spanType !== "DEFAULT");

  const groups = computeSubagentGroups(allSpans);
  if (groups.length === 0) {
    return listSpans.map((span): TranscriptListEntry => ({ type: "span", span: toLightweight(span) }));
  }

  const spanToGroup = new Map<string, CondensedSubagentGroup>();
  for (const group of groups) {
    for (const spanId of group.spanIds) spanToGroup.set(spanId, group);
  }
  const spanMap = new Map<string, TraceViewSpan>();
  for (const s of allSpans) spanMap.set(s.spanId, s);

  // Bucket order matters: first/last-LLM detection below assumes start-time
  // order (the order spans arrive in `listSpans`).
  const groupSpansMap = new Map<string, TraceViewSpan[]>();
  for (const span of listSpans) {
    const group = spanToGroup.get(span.spanId);
    if (!group) continue;
    let bucket = groupSpansMap.get(group.groupId);
    if (!bucket) {
      bucket = [];
      groupSpansMap.set(group.groupId, bucket);
    }
    bucket.push(span);
  }

  const emittedGroups = new Set<string>();
  const entries: TranscriptListEntry[] = [];

  const emitGroupBlock = (group: CondensedSubagentGroup) => {
    const groupSpans = groupSpansMap.get(group.groupId);
    if (!groupSpans || groupSpans.length === 0) return;

    let firstLlm: TraceViewSpan | undefined;
    let lastLlm: TraceViewSpan | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadInputTokens = 0;
    let totalCost = 0;
    for (const s of groupSpans) {
      if (s.spanType === "LLM" || s.spanType === "CACHED") {
        firstLlm ??= s;
        lastLlm = s;
      }
      inputTokens += s.inputTokens;
      outputTokens += s.outputTokens;
      cacheReadInputTokens += s.cacheReadInputTokens ?? 0;
      totalCost += s.totalCost;
    }

    // No LLM/CACHED left after visibility filtering — degrade to standalone
    // rows so the user still sees the spans.
    if (!firstLlm) {
      for (const s of groupSpans) {
        entries.push({ type: "span", span: toLightweight(s) });
      }
      return;
    }

    const toolSpan = spanMap.get(group.toolSpanId);
    const lightSpans = groupSpans.map((s) => toLightweight(s));
    const { groupId } = group;

    entries.push({
      type: "group",
      groupId,
      name: toolSpan?.name ?? groupSpans[0].name,
      path: toolSpan?.path ?? "",
      firstSpan: lightSpans[0],
      firstLlmSpanId: firstLlm.spanId,
      lastLlmSpanId: lastLlm && lastLlm.spanId !== firstLlm.spanId ? lastLlm.spanId : null,
      startTime: groupSpans[0].startTime,
      endTime: groupSpans[groupSpans.length - 1].endTime,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      totalCost,
    });

    entries.push({ type: "group-input", groupId, firstLlmSpanId: firstLlm.spanId });

    for (let i = 0; i < lightSpans.length; i++) {
      entries.push({
        type: "group-span",
        span: lightSpans[i],
        groupId,
        isLast: i === lightSpans.length - 1,
      });
    }
  };

  for (const span of listSpans) {
    const group = spanToGroup.get(span.spanId);
    if (!group) {
      entries.push({ type: "span", span: toLightweight(span) });
      continue;
    }
    if (emittedGroups.has(group.groupId)) continue;
    emittedGroups.add(group.groupId);
    emitGroupBlock(group);
  }

  return entries;
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
export const computeVisibleSpanIds = (selectedIds: Set<string>, spans: TraceViewSpan[]): Set<string> => {
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

  type SpanWithPosition = {
    span: TraceViewSpan;
    left: number;
    width: number;
    originalDepth: number;
    startMs: number;
    endMs: number;
  };

  // spanId -> position map keeps the DFS-ordering pass below O(N).
  const positionById = new Map<string, SpanWithPosition>();
  for (const span of spans) {
    const spanStartMs = new Date(span.startTime).getTime();
    const spanEndMs = new Date(span.endTime).getTime();
    const spanDuration = spanEndMs - spanStartMs;

    const left = ((spanStartMs - startTime) / upperIntervalInMilliseconds) * 100;
    const width = (spanDuration / upperIntervalInMilliseconds) * 100;

    positionById.set(span.spanId, {
      span,
      left,
      width,
      originalDepth: depthMap.get(span.spanId) ?? 0,
      startMs: spanStartMs,
      endMs: spanEndMs,
    });
  }

  const orderedSpans: SpanWithPosition[] = [];
  const visited = new Set<string>();

  const dfsOrder = (spanId: string) => {
    if (visited.has(spanId)) return;
    visited.add(spanId);

    const spanWithPos = positionById.get(spanId);
    if (spanWithPos) {
      orderedSpans.push(spanWithPos);
    }

    const children = childSpansMap[spanId] || [];
    for (const child of children) {
      dfsOrder(child.spanId);
    }
  };

  for (const span of topLevelSpans) {
    dfsOrder(span.spanId);
  }

  // Gravity algorithm: compact spans upward while respecting parent-child invariant
  const rowAssignments = new Map<string, number>();
  const rowOccupancy: Array<Array<{ startMs: number; endMs: number; spanId: string }>> = [];

  // Compare source timestamps; percentage geometry can introduce false overlaps through floating-point rounding.
  const hasOverlap = (row: number, startMs: number, endMs: number, excludeSpanId?: string): boolean => {
    if (!rowOccupancy[row]) return false;
    return rowOccupancy[row].some(
      (occupant) => occupant.spanId !== excludeSpanId && !(endMs <= occupant.startMs || startMs >= occupant.endMs)
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
    while (hasOverlap(targetRow, item.startMs, item.endMs)) {
      targetRow++;
    }

    // Assign the row
    rowAssignments.set(item.span.spanId, targetRow);

    // Mark the row as occupied
    if (!rowOccupancy[targetRow]) {
      rowOccupancy[targetRow] = [];
    }
    rowOccupancy[targetRow].push({
      startMs: item.startMs,
      endMs: item.endMs,
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
