import { type BreakdownNode } from "./types";

/** A flat node carries everything but `children`; `buildTree` nests them. */
export type FlatBreakdownNode = Omit<BreakdownNode, "children">;

/**
 * Nest flat nodes into a forest by `parentId`. A node whose parent is null or
 * absent from the set becomes a root — identical semantics to the original
 * cluster `buildTree`, generalised to any breakdown dimension. Flat dimensions
 * (severity/enum) simply have every node at `parentId === null` → depth-1 trees.
 */
export function buildTree(flat: FlatBreakdownNode[]): BreakdownNode[] {
  const nodeMap = new Map<string, BreakdownNode>();
  const roots: BreakdownNode[] = [];

  flat.forEach((n) => nodeMap.set(n.id, { ...n, children: [] }));

  flat.forEach((n) => {
    const node = nodeMap.get(n.id)!;
    if (n.parentId === null || !nodeMap.has(n.parentId)) {
      roots.push(node);
    } else {
      nodeMap.get(n.parentId)!.children.push(node);
    }
  });

  return roots;
}

export function findNodeById(nodes: BreakdownNode[], id: string): BreakdownNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

export function collectDescendantIds(node: BreakdownNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

/** Path of nodes from the root down to (and including) `targetId`. */
export function buildPath(nodes: BreakdownNode[], targetId: string): BreakdownNode[] {
  const path: BreakdownNode[] = [];

  function dfs(current: BreakdownNode[], target: string): boolean {
    for (const node of current) {
      if (node.id === target) {
        path.push(node);
        return true;
      }
      if (dfs(node.children, target)) {
        path.unshift(node);
        return true;
      }
    }
    return false;
  }

  dfs(nodes, targetId);
  return path;
}

/** Children of the node at `id`; the roots when `id` is null / not found. */
export function visibleChildren(nodes: BreakdownNode[], id: string | null): BreakdownNode[] {
  if (!id) return nodes;
  const node = findNodeById(nodes, id);
  return node ? node.children : nodes;
}

export function isLeaf(nodes: BreakdownNode[], id: string | null): boolean {
  if (!id) return false;
  const node = findNodeById(nodes, id);
  return node !== null && node.children.length === 0;
}

/**
 * Range count per bucket id, summed from the time-series stats. When the range
 * is active we seed the currently-visible bucket ids to 0 so empty buckets
 * still render (mirrors the original `getFilteredCountByCluster`).
 */
export function countsByBucket(stats: { bucketId: string; count: number }[], seedIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of seedIds) counts.set(id, 0);
  for (const row of stats) {
    counts.set(row.bucketId, (counts.get(row.bucketId) ?? 0) + row.count);
  }
  return counts;
}

/**
 * Total events in range = Σ root-bucket counts. Roots aggregate their whole
 * subtree (clusters) or are the only level (flat dims), so summing roots counts
 * each event once — the fixed denominator for the list proportion bars.
 */
export function rangeTotal(nodes: BreakdownNode[], stats: { bucketId: string; count: number }[]): number {
  const byId = new Map<string, number>();
  for (const row of stats) byId.set(row.bucketId, (byId.get(row.bucketId) ?? 0) + row.count);
  let total = 0;
  for (const root of nodes) total += byId.get(root.id) ?? 0;
  return total;
}
