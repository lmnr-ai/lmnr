export interface SkeletonNode {
  /** Share of its row. The strip's value axis, standing in for an event count. */
  weight: number;
  children?: SkeletonNode[];
}

/**
 * The placeholder forest, hand-written rather than random: a skeleton is shown
 * for a second at a time, over and over, and one that reshuffles on every mount
 * draws the eye to the reshuffling. Proportions are eyeballed off a typical
 * signal — a couple of big roots, a thin tail, subtrees getting shallower as
 * they get smaller.
 */
export const FOREST: SkeletonNode[] = [
  {
    weight: 8,
    children: [
      { weight: 5, children: [{ weight: 3 }, { weight: 2 }, { weight: 2 }] },
      { weight: 3, children: [{ weight: 2 }, { weight: 1 }] },
    ],
  },
  {
    weight: 5,
    children: [
      { weight: 3, children: [{ weight: 2 }, { weight: 1 }] },
      { weight: 2, children: [{ weight: 1 }] },
    ],
  },
  { weight: 2, children: [{ weight: 2, children: [{ weight: 1 }, { weight: 1 }] }] },
  { weight: 1, children: [{ weight: 1 }] },
];

/** The row the roots sit on, matching the strip's coarsest level. */
export const ROOT_LEVEL = 3;

export interface LaidNode {
  node: SkeletonNode;
  /** Both 0–1 over the WHOLE strip, not over the row: the shimmer sweeps across
   *  the strip rather than across each row separately. */
  x: number;
  span: number;
}

/**
 * Each node's slice of a row. A `reduce` rather than a running offset in a
 * `map`, since reassigning a local while rendering is what React's immutability
 * rule is about.
 */
export function layOut(row: SkeletonNode[], x: number, span: number): LaidNode[] {
  const total = row.reduce((sum, n) => sum + n.weight, 0) || 1;
  return row.reduce<LaidNode[]>((acc, node) => {
    const prev = acc[acc.length - 1];
    return [...acc, { node, x: prev ? prev.x + prev.span : x, span: (node.weight / total) * span }];
  }, []);
}
