// The cluster forest the icicle strip draws: every cluster that has events in
// the selected window, re-hung as a tree with rolled-up counts.
//
// The model keeps EVERY such cluster. Truncation is a property of a view that ran
// out of room — the strip is width-constrained and does its own fold — not a
// property of the data.

import { type ClusterStatsDataPoint, type EventCluster } from "@/lib/actions/clusters";
import { getClusterColorById } from "@/lib/clusters/colors";

/** Cluster levels kept, coarsest last: L1 (finest) through L3. Deeper levels
 *  exist in the data but have nowhere to go on a three-row strip. */
export const MAX_LEVELS = 3;

export interface ClusterNode {
  id: string;
  name: string;
  color: string;
  /** Events in the window, rolled up over the subtree — see `rollUpCounts`. */
  total: number;
  level: number;
  parentId: string | null;
  children: ClusterNode[];
}

export interface ClusterModel {
  /** Roots at the coarsest level, siblings biggest-first within each parent. */
  tree: ClusterNode[];
  /**
   * Every cluster's full ancestor chain. `ancestors.get(a)?.has(b)` answers "is a
   * a descendant of b?" in one lookup, which is what the strip's focus test does
   * on every band of every render.
   */
  ancestors: Map<string, Set<string>>;
  /** Clusters that break down into something finer. */
  hasChildren: Set<string>;
}

/**
 * Replace every non-leaf cluster's count with the sum of its children's, finest
 * level first.
 *
 * `events_to_clusters` is many-to-many, so an event can sit in several clusters
 * at the same level — summing siblings double-counts the overlap and a parent's
 * own count comes out *below* its children's total. Incremental clustering adds
 * the opposite skew: an event can have an L1 cluster whose L2/L3 ancestors are
 * not assigned yet. Either way a parent band ends up narrower than the children
 * standing inside it, which the strip's nesting cannot express.
 *
 * The cost is that a coarse band no longer shows its own event count — it shows
 * its subtree's.
 */
function rollUpCounts(clusters: EventCluster[], totals: Map<string, number>): void {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const children = new Map<string, string[]>();
  for (const c of clusters) {
    if (!c.parentId || c.parentId === c.id || !byId.has(c.parentId)) continue;
    const list = children.get(c.parentId);
    if (list) list.push(c.id);
    else children.set(c.parentId, [c.id]);
  }

  // Ascending level = children before parents, so one pass suffices.
  for (const c of [...clusters].sort((a, b) => a.level - b.level)) {
    const kids = children.get(c.id);
    if (!kids) continue;
    totals.set(
      c.id,
      kids.reduce((sum, kid) => sum + (totals.get(kid) ?? 0), 0)
    );
  }
}

/** Walk each cluster up its `parentId` chain and cache the ids it passes. */
function buildAncestors(clusters: EventCluster[]): Map<string, Set<string>> {
  const parent = new Map(clusters.map((c) => [c.id, c.parentId]));
  const cache = new Map<string, Set<string>>();

  const of = (id: string): Set<string> => {
    const hit = cache.get(id);
    if (hit) return hit;
    // Seed before recursing so a cyclic parent chain terminates instead of
    // blowing the stack.
    const set = new Set<string>();
    cache.set(id, set);
    const p = parent.get(id);
    if (p && p !== id) {
      set.add(p);
      for (const a of of(p)) set.add(a);
    }
    return set;
  };

  for (const c of clusters) of(c.id);
  return cache;
}

/**
 * Re-hang the drawn clusters as a forest, coarsest level first.
 *
 * A cluster whose parent was dropped — filtered out by level, out of the window,
 * or a dangling id — becomes a root of its own, so nothing disappears. Those
 * orphans are common: incremental clustering assigns an event's L1 cluster before
 * its ancestors exist, which is why the strip's top row can mix levels.
 */
function buildTree(byLevel: ClusterNode[][]): ClusterNode[] {
  const nodes = new Map<string, ClusterNode>();
  for (const level of byLevel) for (const c of level) nodes.set(c.id, c);

  const roots: ClusterNode[] = [];
  for (const level of [...byLevel].reverse()) {
    for (const node of level) {
      const parent = node.parentId && node.parentId !== node.id ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

export function buildClusterModel(
  clusters: EventCluster[],
  stats: ClusterStatsDataPoint[],
  maxLevels: number = MAX_LEVELS
): ClusterModel | null {
  if (clusters.length === 0 || stats.length === 0) return null;

  const byId = new Map(clusters.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const row of stats) {
    if (!byId.has(row.cluster_id)) continue;
    totals.set(row.cluster_id, (totals.get(row.cluster_id) ?? 0) + (Number(row.count) || 0));
  }
  rollUpCounts(clusters, totals);

  const levelNumbers = Array.from(new Set(clusters.map((c) => c.level)))
    .filter((l) => l > 0)
    .sort((a, b) => a - b)
    .slice(0, maxLevels);
  if (levelNumbers.length === 0) return null;

  const byLevel = levelNumbers.map((level) =>
    clusters
      .filter((c) => c.level === level && (totals.get(c.id) ?? 0) > 0)
      .map((c): ClusterNode => ({
        id: c.id,
        name: c.name,
        color: getClusterColorById(c.id),
        total: totals.get(c.id) ?? 0,
        level: c.level,
        parentId: c.parentId,
        children: [],
      }))
      // Biggest first, so each row of the strip reads left-to-right as a ranking.
      .sort((a, b) => b.total - a.total)
  );

  const tree = buildTree(byLevel);
  if (tree.length === 0) return null;

  return {
    tree,
    ancestors: buildAncestors(clusters),
    hasChildren: new Set(clusters.filter((c) => c.parentId && c.parentId !== c.id).map((c) => c.parentId as string)),
  };
}
