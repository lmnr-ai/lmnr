import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { transformSpansToCondensedTimeline } from "@/components/traces/trace-view/store/utils";

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

/**
 * Creates a condensed block from a tree node, grouping its entire subtree.
 */
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
 * Creates a single-span block for a parent node (uses the span's own time, not subtree).
 */
function singleSpanBlock(node: SpanTreeNode): CondensedBlock {
  return {
    parentSpanId: node.span.spanId,
    spanIds: [node.span.spanId],
    startTimeMs: new Date(node.span.startTime).getTime(),
    endTimeMs: new Date(node.span.endTime).getTime(),
    spanCount: 1,
    depth: node.depth,
    topRow: 0,
    heightInRows: 1,
    primarySpanType: node.span.spanType,
    spanName: node.span.name,
    childNames: [],
    childTypes: [],
  };
}

/**
 * DFS walk that generates blocks at a given depth.
 * Nodes above the depth cutoff with children are emitted as individual span bars,
 * then their children are recursed into.
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
    // Parent above cutoff: emit as individual span bar, then recurse into children
    blocks.push(singleSpanBlock(node));
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
 * Compute the fully-expanded layout by calling the exact same
 * transformSpansToCondensedTimeline used by the condensed timeline view.
 * This guarantees identical row assignments.
 */
export function computeExpandedLayout(spans: TraceViewSpan[]): { rowMap: Map<string, number>; totalRows: number } {
  const { spans: condensedSpans, totalRows } = transformSpansToCondensedTimeline(spans);

  const rowMap = new Map<string, number>();
  for (const cs of condensedSpans) {
    rowMap.set(cs.span.spanId, cs.row);
  }

  return { rowMap, totalRows };
}

/**
 * Compute blocks at a given depth, using the expanded layout for row positions.
 * Single-span blocks use their direct row assignment.
 * Condensed blocks span the rows their children would occupy when fully expanded.
 */
export function computeBlocksWithLayout(
  roots: SpanTreeNode[],
  depth: number,
  expandedRowMap: Map<string, number>
): CondensedBlock[] {
  const rawBlocks = getBlocksAtDepth(roots, depth);

  return rawBlocks.map((block) => {
    // Single-span blocks: use direct row from expanded layout
    if (block.spanCount === 1) {
      const row = expandedRowMap.get(block.parentSpanId) ?? 0;
      return { ...block, topRow: row, heightInRows: 1 };
    }

    // Condensed blocks: span the rows of all contained spans
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

/**
 * Collect all descendant names/types from a tree node (excluding the node itself).
 */
function collectDescendantInfo(node: SpanTreeNode): { names: string[]; types: string[] } {
  const names: string[] = [];
  const types: string[] = [];
  function walk(n: SpanTreeNode) {
    for (const child of n.children) {
      names.push(child.span.name);
      types.push(child.span.spanType);
      walk(child);
    }
  }
  walk(node);
  return { names, types };
}

/**
 * Collect all unique condensed blocks across all depth levels.
 * Used for prefetching AI summaries. Includes ALL descendant names
 * so the LLM has full context even for grandparent-level blocks.
 */
export function getAllCondensedBlockInputs(
  roots: SpanTreeNode[],
  maxDepth: number
): { blockId: string; spanName: string; spanType: string; descendantNames: string[]; descendantTypes: string[] }[] {
  // Build a lookup from spanId → tree node for fast access
  const nodeMap = new Map<string, SpanTreeNode>();
  function indexNodes(node: SpanTreeNode) {
    nodeMap.set(node.span.spanId, node);
    for (const child of node.children) indexNodes(child);
  }
  for (const root of roots) indexNodes(root);

  const seen = new Set<string>();
  const result: {
    blockId: string;
    spanName: string;
    spanType: string;
    descendantNames: string[];
    descendantTypes: string[];
  }[] = [];

  for (let d = 0; d <= maxDepth; d++) {
    for (const block of getBlocksAtDepth(roots, d)) {
      if (block.spanCount > 1 && !seen.has(block.parentSpanId)) {
        seen.add(block.parentSpanId);
        const node = nodeMap.get(block.parentSpanId);
        const { names, types } = node
          ? collectDescendantInfo(node)
          : { names: block.childNames, types: block.childTypes };
        result.push({
          blockId: block.parentSpanId,
          spanName: block.spanName,
          spanType: block.primarySpanType,
          descendantNames: names,
          descendantTypes: types,
        });
      }
    }
  }

  return result;
}

/**
 * Build a lightweight indented skeleton of the span tree for LLM context.
 * Much cheaper than getTraceStructureAsString — no DB call, no full I/O.
 */
export function buildTreeSkeleton(roots: SpanTreeNode[]): string {
  const lines: string[] = [];
  function walk(node: SpanTreeNode) {
    const indent = "  ".repeat(node.depth);
    lines.push(`${indent}- ${node.span.name} (${node.span.spanType})`);
    for (const child of node.children) walk(child);
  }
  for (const root of roots) walk(root);
  return lines.join("\n");
}

/**
 * Pre-compute the subtree row range for every node in the tree.
 * Each entry maps spanId → { minRow, maxRow } covering the node and all descendants.
 */
export function computeSubtreeRowRanges(
  roots: SpanTreeNode[],
  rowMap: Map<string, number>
): Map<string, { minRow: number; maxRow: number }> {
  const result = new Map<string, { minRow: number; maxRow: number }>();

  function walk(node: SpanTreeNode): { minRow: number; maxRow: number } {
    const selfRow = rowMap.get(node.span.spanId) ?? 0;
    let min = selfRow;
    let max = selfRow;

    for (const child of node.children) {
      const childRange = walk(child);
      min = Math.min(min, childRange.minRow);
      max = Math.max(max, childRange.maxRow);
    }

    result.set(node.span.spanId, { minRow: min, maxRow: max });
    return { minRow: min, maxRow: max };
  }

  for (const root of roots) {
    walk(root);
  }
  return result;
}
