import YAML from "yaml";

import {
  calculateDuration,
  formatUtcTimestamp,
  replaceBase64Images,
  type Span,
  type SpanInfo,
  truncateLlmInput,
  truncateValue,
} from "@/lib/actions/trace/agent/spans";

// ─── Annotated tree ─────────────────────────────────────────────────────────

export interface AnnotatedNode {
  spanInfo: SpanInfo;
  children: AnnotatedNode[];
  /** Number of LLM/TOOL descendants (not counting self). */
  llmToolDescendantCount: number;
}

/**
 * Build a tree from flat spanInfos, annotating each node with its LLM/TOOL
 * descendant count.
 */
export function buildAnnotatedTree(spanInfos: SpanInfo[]): AnnotatedNode[] {
  const nodeMap = new Map<string, AnnotatedNode>();
  const roots: AnnotatedNode[] = [];

  // Create nodes
  for (const info of spanInfos) {
    nodeMap.set(info.spanId, { spanInfo: info, children: [], llmToolDescendantCount: 0 });
  }

  // Wire parent→child
  for (const info of spanInfos) {
    const node = nodeMap.get(info.spanId)!;
    if (info.parent && nodeMap.has(info.parent)) {
      nodeMap.get(info.parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Bottom-up: count LLM/TOOL descendants
  function annotate(node: AnnotatedNode): number {
    let count = 0;
    for (const child of node.children) {
      if (child.spanInfo.type === "LLM" || child.spanInfo.type === "TOOL") {
        count++;
      }
      count += annotate(child);
    }
    node.llmToolDescendantCount = count;
    return count;
  }
  for (const root of roots) annotate(root);

  return roots;
}

// ─── Partition points ───────────────────────────────────────────────────────

/**
 * Find partition points: deepest nodes whose LLM/TOOL descendant count >= threshold
 * but none of whose children meet the threshold.
 */
export function findPartitionPoints(roots: AnnotatedNode[], threshold: number): Set<string> {
  const points = new Set<string>();

  function dfs(node: AnnotatedNode) {
    if (node.llmToolDescendantCount < threshold) return;

    // Check if any child also meets threshold
    const childMeetsThreshold = node.children.some((c) => c.llmToolDescendantCount >= threshold);

    if (childMeetsThreshold) {
      // Recurse into children — this node is not the deepest
      for (const child of node.children) dfs(child);
    } else {
      // This is a partition point — deepest node with >= threshold
      points.add(node.spanInfo.spanId);
    }
  }

  for (const root of roots) dfs(root);
  return points;
}

// ─── Subtree collection ─────────────────────────────────────────────────────

/** Collect all spanIds in the subtree rooted at the node with `rootSpanId`. */
export function collectSubtreeSpanIds(roots: AnnotatedNode[], rootSpanId: string): Set<string> {
  const ids = new Set<string>();

  function findAndCollect(node: AnnotatedNode): boolean {
    if (node.spanInfo.spanId === rootSpanId) {
      collectAll(node);
      return true;
    }
    for (const child of node.children) {
      if (findAndCollect(child)) return true;
    }
    return false;
  }

  function collectAll(node: AnnotatedNode) {
    ids.add(node.spanInfo.spanId);
    for (const child of node.children) collectAll(child);
  }

  for (const root of roots) {
    if (findAndCollect(root)) break;
  }
  return ids;
}

/**
 * Given a set of spanIds forming a subtree, return the blockIds (spanIds)
 * of non-leaf nodes within that subtree. These are the nodes that need
 * displaySummary + icon.
 */
export function identifyNonLeafBlocks(spanInfos: SpanInfo[], subtreeSpanIds: Set<string>): string[] {
  // Build child count within the subtree
  const childCount = new Map<string, number>();
  for (const id of subtreeSpanIds) childCount.set(id, 0);

  for (const info of spanInfos) {
    if (!subtreeSpanIds.has(info.spanId)) continue;
    if (info.parent && subtreeSpanIds.has(info.parent)) {
      childCount.set(info.parent, (childCount.get(info.parent) ?? 0) + 1);
    }
  }

  return [...childCount.entries()].filter(([, count]) => count > 0).map(([id]) => id);
}

// ─── Sub-context builders ───────────────────────────────────────────────────

interface DetailedSpanView {
  id: number;
  name: string;
  path: string;
  type: string;
  start: string;
  duration: number;
  parent: number | null;
  status?: string;
  input?: unknown;
  output?: unknown;
  exception?: unknown;
}

/**
 * Build a skeleton string scoped to a subtree, with local sequential IDs.
 * Returns skeleton string and a map from spanId → local seqId.
 */
export function buildSubSkeleton(
  spanInfos: SpanInfo[],
  subtreeSpanIds: Set<string>
): { skeleton: string; localSeqIdMap: Map<string, number> } {
  const filtered = spanInfos.filter((s) => subtreeSpanIds.has(s.spanId));
  const localSeqIdMap = new Map<string, number>();
  filtered.forEach((s, i) => localSeqIdMap.set(s.spanId, i + 1));

  let result = "legend: span_name (id, parent_id, type)\n";
  for (const info of filtered) {
    const seqId = localSeqIdMap.get(info.spanId)!;
    const parentSeqId = info.parent && localSeqIdMap.has(info.parent) ? localSeqIdMap.get(info.parent)! : null;
    result += `- ${info.name} (${seqId}, ${parentSeqId ?? "null"}, ${info.type})\n`;
  }

  return { skeleton: result, localSeqIdMap };
}

/**
 * Build YAML for LLM/TOOL spans within a subtree, using the same
 * truncation rules as the main trace builder.
 */
export function buildSubYaml(
  spanInfos: SpanInfo[],
  spansMap: Map<string, Span>,
  subtreeSpanIds: Set<string>,
  localSeqIdMap: Map<string, number>
): string {
  const seenPaths = new Set<string>();
  const detailedSpans: DetailedSpanView[] = [];

  for (const info of spanInfos) {
    if (!subtreeSpanIds.has(info.spanId)) continue;
    if (info.type !== "LLM" && info.type !== "TOOL") continue;

    const span = spansMap.get(info.spanId);
    if (!span) continue;

    const seqId = localSeqIdMap.get(info.spanId)!;
    const parentSeqId = info.parent && localSeqIdMap.has(info.parent) ? localSeqIdMap.get(info.parent)! : null;

    const spanView: DetailedSpanView = {
      id: seqId,
      name: info.name,
      path: info.path,
      type: info.type.toLowerCase(),
      start: formatUtcTimestamp(info.start),
      duration: calculateDuration(info.start, info.end),
      parent: parentSeqId,
    };

    if (info.status === "error") {
      spanView.status = "error";
    }

    const isTool = info.type === "TOOL";
    if (!seenPaths.has(info.path)) {
      seenPaths.add(info.path);
      spanView.input = isTool ? truncateValue(span.input) : truncateLlmInput(replaceBase64Images(span.input));
    }
    spanView.output = isTool ? truncateValue(span.output) : replaceBase64Images(span.output);

    if (span.exception) {
      spanView.exception = span.exception;
    }

    detailedSpans.push(spanView);
  }

  return YAML.stringify(detailedSpans);
}

// ─── Collapsed context for Phase 2 ─────────────────────────────────────────

/**
 * Build the full skeleton but replace partition subtrees with a single
 * collapsed line containing their deep summary.
 */
export function buildCollapsedSkeleton(
  spanInfos: SpanInfo[],
  deepSummaries: Map<string, string>,
  partitionSubtreeIds: Map<string, Set<string>>
): string {
  // Collect all spanIds that belong to any partition (excluding the root itself)
  const collapsedSpanIds = new Set<string>();
  for (const [rootId, subtreeIds] of partitionSubtreeIds) {
    for (const id of subtreeIds) {
      if (id !== rootId) collapsedSpanIds.add(id);
    }
  }

  // Build global seqId map (for parent references)
  const spanIdToSeqId: Record<string, number> = {};
  spanInfos.forEach((info, i) => {
    spanIdToSeqId[info.spanId] = i + 1;
  });

  let result = "legend: span_name (id, parent_id, type)\n";
  for (let i = 0; i < spanInfos.length; i++) {
    const info = spanInfos[i];

    // Skip spans inside a partition subtree (but not the partition root)
    if (collapsedSpanIds.has(info.spanId)) continue;

    const seqId = i + 1;
    const parentSeqId = info.parent ? (spanIdToSeqId[info.parent] ?? null) : null;

    const isPartitionRoot = partitionSubtreeIds.has(info.spanId);
    const deepSummary = deepSummaries.get(info.spanId);
    if (isPartitionRoot) {
      // Partition root: show collapsed with summary (or placeholder)
      const summary = deepSummary ?? `sub-agent execution in ${info.name}`;
      result += `- ${info.name} (${seqId}, ${parentSeqId ?? "null"}, BLOCK) [Summary: ${summary}]\n`;
    } else {
      result += `- ${info.name} (${seqId}, ${parentSeqId ?? "null"}, ${info.type})\n`;
    }
  }

  return result;
}

/**
 * Build YAML for LLM/TOOL spans NOT inside any partition subtree.
 */
export function buildCollapsedYaml(
  spanInfos: SpanInfo[],
  spansMap: Map<string, Span>,
  allPartitionSpanIds: Set<string>
): string {
  // Build global seqId map
  const spanIdToSeqId: Record<string, number> = {};
  spanInfos.forEach((info, i) => {
    spanIdToSeqId[info.spanId] = i + 1;
  });

  const seenPaths = new Set<string>();
  const detailedSpans: DetailedSpanView[] = [];

  for (let i = 0; i < spanInfos.length; i++) {
    const info = spanInfos[i];
    if (allPartitionSpanIds.has(info.spanId)) continue;
    if (info.type !== "LLM" && info.type !== "TOOL") continue;

    const span = spansMap.get(info.spanId);
    if (!span) continue;

    const seqId = i + 1;
    const parentSeqId = info.parent ? (spanIdToSeqId[info.parent] ?? null) : null;

    const spanView: DetailedSpanView = {
      id: seqId,
      name: info.name,
      path: info.path,
      type: info.type.toLowerCase(),
      start: formatUtcTimestamp(info.start),
      duration: calculateDuration(info.start, info.end),
      parent: parentSeqId,
    };

    if (info.status === "error") {
      spanView.status = "error";
    }

    const isTool = info.type === "TOOL";
    if (!seenPaths.has(info.path)) {
      seenPaths.add(info.path);
      spanView.input = isTool ? truncateValue(span.input) : truncateLlmInput(replaceBase64Images(span.input));
    }
    spanView.output = isTool ? truncateValue(span.output) : replaceBase64Images(span.output);

    if (span.exception) {
      spanView.exception = span.exception;
    }

    detailedSpans.push(spanView);
  }

  return YAML.stringify(detailedSpans);
}
