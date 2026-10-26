import { type EventCluster } from "./types";

/** L1 is the finest named level and always shown; only coarser levels can be hidden. */
export const MIN_HIDEABLE_LEVEL = 2;

/**
 * Levels (>= `MIN_HIDEABLE_LEVEL`) holding exactly one cluster in the signal's whole
 * history. A lone coarse cluster only means something next to siblings; on its own
 * it is a catch-all like "agent issues".
 */
export const getStandaloneLevels = (levelCounts: { level: number; count: number }[]): Set<number> =>
  new Set(
    levelCounts.filter(({ level, count }) => level >= MIN_HIDEABLE_LEVEL && count === 1).map(({ level }) => level)
  );

/**
 * Drop every cluster on a standalone level and hang its children on the nearest
 * ancestor that stays, so the tree loses a level instead of splitting at the gap.
 */
export const hideStandaloneLevels = (clusters: EventCluster[], standaloneLevels: Set<number>): EventCluster[] => {
  if (standaloneLevels.size === 0) return clusters;

  const hiddenParent = new Map<string, string | null>();
  for (const c of clusters) {
    if (standaloneLevels.has(c.level)) hiddenParent.set(c.id, c.parentId);
  }

  const resolveParent = (parentId: string | null): string | null => {
    const seen = new Set<string>();
    let current = parentId;
    // `seen` guards against a cyclic parent chain.
    while (current !== null && hiddenParent.has(current) && !seen.has(current)) {
      seen.add(current);
      current = hiddenParent.get(current) ?? null;
    }
    return current !== null && hiddenParent.has(current) ? null : current;
  };

  return clusters
    .filter((c) => !standaloneLevels.has(c.level))
    .map((c) => {
      const parentId = resolveParent(c.parentId);
      return parentId === c.parentId ? c : { ...c, parentId };
    });
};
