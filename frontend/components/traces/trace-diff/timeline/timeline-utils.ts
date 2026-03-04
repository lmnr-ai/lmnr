import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";

import { type CondensedBlock, type SpanTreeNode } from "./timeline-types";

/**
 * Builds a tree from flat spans using parentSpanId relationships.
 * Computes subtree time bounds and span counts for each node.
 */
export function buildSpanTree(spans: TraceViewSpan[]): SpanTreeNode[] {
  const byId = new Map<string, TraceViewSpan>();
  const childrenMap = new Map<string, TraceViewSpan[]>();

  for (const span of spans) {
    byId.set(span.spanId, span);
    const parentId = span.parentSpanId;
    if (parentId) {
      const siblings = childrenMap.get(parentId);
      if (siblings) {
        siblings.push(span);
      } else {
        childrenMap.set(parentId, [span]);
      }
    }
  }

  function buildNode(span: TraceViewSpan, depth: number): SpanTreeNode {
    const children = (childrenMap.get(span.spanId) ?? [])
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map((child) => buildNode(child, depth + 1));

    const selfStart = new Date(span.startTime).getTime();
    const selfEnd = new Date(span.endTime).getTime();

    let subtreeStart = selfStart;
    let subtreeEnd = selfEnd;
    let subtreeCount = 1;

    for (const child of children) {
      subtreeStart = Math.min(subtreeStart, child.subtreeStartTime);
      subtreeEnd = Math.max(subtreeEnd, child.subtreeEndTime);
      subtreeCount += child.subtreeSpanCount;
    }

    return {
      span,
      children,
      depth,
      subtreeStartTime: subtreeStart,
      subtreeEndTime: subtreeEnd,
      subtreeSpanCount: subtreeCount,
    };
  }

  // Find roots: spans whose parentSpanId is missing or not in the set
  const roots = spans
    .filter((s) => !s.parentSpanId || !byId.has(s.parentSpanId))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((s) => buildNode(s, 0));

  return roots;
}

/**
 * Computes the maximum depth in the tree (0-indexed).
 */
export function computeMaxDepth(roots: SpanTreeNode[]): number {
  if (roots.length === 0) return 0;

  function maxDepthOf(node: SpanTreeNode): number {
    if (node.children.length === 0) return node.depth;
    return Math.max(...node.children.map(maxDepthOf));
  }

  return Math.max(...roots.map(maxDepthOf));
}

/**
 * Collects all span IDs in a subtree (including the root).
 */
function collectSpanIds(node: SpanTreeNode): string[] {
  const ids: string[] = [node.span.spanId];
  for (const child of node.children) {
    ids.push(...collectSpanIds(child));
  }
  return ids;
}

/**
 * Creates a CondensedBlock from a tree node, grouping its entire subtree.
 */
function nodeToBlock(node: SpanTreeNode): CondensedBlock {
  return {
    parentSpanId: node.span.spanId,
    spanIds: collectSpanIds(node),
    startTimeMs: node.subtreeStartTime,
    endTimeMs: node.subtreeEndTime,
    spanCount: node.subtreeSpanCount,
    depth: node.depth,
    row: 0,
    primarySpanType: node.span.spanType,
    spanName: node.span.name,
    childNames: node.children.map((c) => c.span.name),
    childTypes: node.children.map((c) => c.span.spanType),
  };
}

/**
 * DFS walk that generates blocks at a given depth.
 * - Nodes at exactly `depth` become blocks grouping their subtree
 * - Leaf nodes shallower than `depth` become their own blocks
 * - At depth 0, each root is one block
 */
export function getBlocksAtDepth(roots: SpanTreeNode[], depth: number): CondensedBlock[] {
  const blocks: CondensedBlock[] = [];

  function walk(node: SpanTreeNode): void {
    // This node is at or past the target depth, or is a leaf — make it a block
    if (node.depth >= depth || node.children.length === 0) {
      blocks.push(nodeToBlock(node));
      return;
    }
    // Continue deeper
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return blocks;
}

/**
 * Greedy interval scheduling: sort by startTime, assign each block to the
 * lowest non-overlapping row.
 */
export function assignBlockRows(blocks: CondensedBlock[]): CondensedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startTimeMs - b.startTimeMs || a.endTimeMs - b.endTimeMs);

  // rowEndTimes[i] = the earliest time at which row i is free
  const rowEndTimes: number[] = [];

  return sorted.map((block) => {
    let assignedRow = -1;
    for (let r = 0; r < rowEndTimes.length; r++) {
      if (rowEndTimes[r] <= block.startTimeMs) {
        assignedRow = r;
        break;
      }
    }
    if (assignedRow === -1) {
      assignedRow = rowEndTimes.length;
      rowEndTimes.push(0);
    }
    rowEndTimes[assignedRow] = block.endTimeMs;
    return { ...block, row: assignedRow };
  });
}
