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

  const roots = spans
    .filter((s) => !s.parentSpanId || !byId.has(s.parentSpanId))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((s) => buildNode(s, 0));

  return roots;
}

export function computeMaxDepth(roots: SpanTreeNode[]): number {
  if (roots.length === 0) return 0;
  function maxDepthOf(node: SpanTreeNode): number {
    if (node.children.length === 0) return node.depth;
    return Math.max(...node.children.map(maxDepthOf));
  }
  return Math.max(...roots.map(maxDepthOf));
}

function collectSpanIds(node: SpanTreeNode): string[] {
  const ids: string[] = [node.span.spanId];
  for (const child of node.children) {
    ids.push(...collectSpanIds(child));
  }
  return ids;
}

function nodeToBlock(node: SpanTreeNode): CondensedBlock {
  return {
    parentSpanId: node.span.spanId,
    spanIds: collectSpanIds(node),
    startTimeMs: node.subtreeStartTime,
    endTimeMs: node.subtreeEndTime,
    spanCount: node.subtreeSpanCount,
    depth: node.depth,
    topRow: 0,
    heightInRows: 1,
    primarySpanType: node.span.spanType,
    spanName: node.span.name,
    childNames: node.children.map((c) => c.span.name),
    childTypes: node.children.map((c) => c.span.spanType),
  };
}

/**
 * DFS walk that generates blocks at a given depth.
 * Nodes at or past `depth` become blocks grouping their subtree.
 * Leaf nodes shallower than `depth` become their own blocks.
 */
export function getBlocksAtDepth(roots: SpanTreeNode[], depth: number): CondensedBlock[] {
  const blocks: CondensedBlock[] = [];

  function walk(node: SpanTreeNode): void {
    if (node.depth >= depth || node.children.length === 0) {
      blocks.push(nodeToBlock(node));
      return;
    }
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
 * Greedy interval scheduling: assign each block to the lowest non-overlapping row.
 */
function assignBlockRows(blocks: CondensedBlock[]): CondensedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startTimeMs - b.startTimeMs || a.endTimeMs - b.endTimeMs);
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
    return { ...block, topRow: assignedRow, heightInRows: 1 };
  });
}

/**
 * Compute the fully-expanded layout (each span as its own block with row assignments).
 * Returns a map of spanId → row and the total number of rows.
 */
export function computeExpandedLayout(roots: SpanTreeNode[]): { rowMap: Map<string, number>; totalRows: number } {
  const maxDepth = computeMaxDepth(roots);
  const leafBlocks = assignBlockRows(getBlocksAtDepth(roots, maxDepth));

  const rowMap = new Map<string, number>();
  let maxRow = 0;
  for (const block of leafBlocks) {
    rowMap.set(block.parentSpanId, block.topRow);
    maxRow = Math.max(maxRow, block.topRow);
  }

  return { rowMap, totalRows: maxRow + 1 };
}

/**
 * Compute blocks at a given depth, using the expanded layout for row positions.
 * Collapsed blocks span the same rows their children would occupy when fully expanded.
 */
export function computeBlocksWithLayout(
  roots: SpanTreeNode[],
  depth: number,
  expandedRowMap: Map<string, number>
): CondensedBlock[] {
  const rawBlocks = getBlocksAtDepth(roots, depth);

  return rawBlocks.map((block) => {
    let minRow = Infinity;
    let maxRow = -1;

    for (const spanId of block.spanIds) {
      const row = expandedRowMap.get(spanId);
      if (row !== undefined) {
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
      }
    }

    if (minRow === Infinity) {
      minRow = 0;
      maxRow = 0;
    }

    return { ...block, topRow: minRow, heightInRows: maxRow - minRow + 1 };
  });
}
