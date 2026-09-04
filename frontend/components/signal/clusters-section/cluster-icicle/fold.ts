// The strip's fold, with no React in it — split out so it can be exercised at
// the seam. `tests/cluster-icicle-fold.test.ts` runs it against a synthetic
// cluster forest and asserts the row it produces is one a person could read. The
// bugs in here are all arithmetic, and arithmetic is testable without a DOM.

import { type ClusterNode } from "../model";
import { BAND, EXTRA, FREE_SPACE_TARGET, PANEL } from "./constants";

/**
 * A band in the strip's own view of the forest.
 *
 * `isExtra` marks the synthetic band standing in for the siblings this row had
 * no width for; `extra` is the clusters it stands for, biggest first, which its
 * tooltip lists.
 */
// `Omit` on `children` rather than an intersection: intersecting two array types
// leaves `children.some(c => ...)` inferring `c` as a `ClusterNode`, so the extra
// fields below are invisible one level down.
export interface ViewNode extends Omit<ClusterNode, "children"> {
  isExtra?: boolean;
  /**
   * A counter that is only there to carry a number down a row.
   *
   * When a parent folds, its children fold with it and the counter is left
   * standing on its row with nothing underneath — while every real band beside it
   * has a row of children hanging off it. So a counter grows BEADS: one more
   * counter per row below it, joined by the same stem a real band uses, reading
   * how many clusters folded away on that row. Only the top bead answers the
   * pointer; the rest are a readout, not a way in.
   */
  isBead?: boolean;
  extra?: ViewNode[];
  need?: number;
  children: ViewNode[];
  /**
   * Rows this node has to stand as tall as but does not contain, in levels.
   *
   * A column's HEIGHT is what puts its band on the right row — rows are
   * `items-end`, so a column hugs its subtree and bottoms out on the strip. A
   * counter standing for L2 clusters has no children at all, so without this it
   * is one row tall and falls to the L1 row, where it sits with no parent above
   * it and no rows below. The same is true of a real cluster that has no children
   * and is not on the finest row.
   */
  foldedDepth?: number;
  /**
   * The children BEFORE folding. `children` is the row as drawn, so it can hold a
   * synthetic `+5` band; this is the real clusters. Anything that lists a
   * cluster's contents wants this one — a fold is a fact about how much width the
   * row had, and has no business showing up in a list.
   */
  all?: ViewNode[];
}

export function finestLevel(nodes: ViewNode[], acc: number): number {
  for (const n of nodes) acc = finestLevel(n.children, Math.min(acc, n.level));
  return acc;
}

/**
 * The level whose children row is a row of GROUPS rather than a row of siblings.
 * Absolute, not "whichever level happens to be coarsest here": a tree with only
 * L1 and L2 in it has no groups to separate, so its L2 parents' children take the
 * tight gap like any other row.
 */
const GROUP_LEVEL = 3;

/**
 * How wide a counter is ASSUMED to be, at its very widest.
 *
 * The pill hugs its label, so its real width depends on the number in it and is
 * not known until it is laid out — while the fold has to know what a counter
 * costs *before* it decides to create one. So it is not measured, it is bounded:
 * every counter is budgeted as though it read `+999`, the widest a three-digit
 * count can be.
 *
 * That biases the strip towards folding slightly more than it strictly has to. It
 * is the safe direction — the surplus is handed straight back to the proportional
 * split, so it goes into the bands rather than going missing.
 */
const EXTRA_MAX_DIGITS = 3;
/** Advance width of one digit as a fraction of the font size, in the UI sans. */
const DIGIT_EM = 0.62;
export const EXTRA_BAND_WIDTH = Math.ceil(
  (EXTRA_MAX_DIGITS + 1) * DIGIT_EM * BAND.labelSize +
    // The pill's own inset, then the label's extra inset on top of it, both sides.
    2 * BAND.paddingX +
    2 * (BAND.paddingX + EXTRA.padLeft)
);

/**
 * The strip's TRUE minimum width, in one formula, used by everything.
 *
 * A row of columns cannot be narrower than the sum of what its columns need, plus
 * a gap between each pair, plus (inside a focused panel) the panel's own inset. A
 * parent column cannot be narrower than that row, and it cannot be narrower than
 * one band either. `annotateNeed` writes this onto the node as its CSS
 * `min-width`, and the chooser below measures candidate selections with the same
 * function — the two cannot drift, which is the whole reason it is one function
 * and not two.
 */
function rowNeed(entries: number[], gap: number): number {
  if (entries.length === 0) return BAND.minWidth;
  const inner = entries.reduce((sum, n) => sum + n, 0) + (entries.length - 1) * gap + 2 * PANEL.padX;
  return Math.max(BAND.minWidth, inner);
}

/**
 * The gap inside a level-`level` node's children row.
 *
 * An L3 cluster's children ARE the strip's top-level groups, so that one row
 * takes the wider `groupGap`; everything deeper is siblings inside a group and
 * takes the tight `columnGap`.
 *
 * Exported because the strip renders with it and the width arithmetic below
 * measures with it. Those two cannot drift — a row laid out on `groupGap` but
 * budgeted at `columnGap` overflows by the difference times its child count.
 */
export function childRowGap(level: number): number {
  return level === GROUP_LEVEL ? BAND.groupGap : BAND.columnGap;
}

/**
 * Decide which clusters the strip can afford to show.
 *
 * ## The spec, and the whole algorithm
 *
 * Free space is `stripWidth - stripNeed`, and it must stay at or above
 * `FREE_SPACE_TARGET` of the strip. Subject to that, show the biggest clusters.
 * So: start from nothing shown, walk the leaves biggest-first, and admit each one
 * if the strip still fits afterwards. That is it.
 *
 * ## Why it cannot overflow
 *
 * Admission is not estimated, it is MEASURED: after tentatively adding a leaf we
 * recompute the strip's exact need with `rowNeed` — the same function that later
 * writes each column's `min-width` — and roll the leaf back if the answer is over
 * budget. The invariant `stripNeed <= width * (1 - FREE_SPACE_TARGET)` therefore
 * holds after every single step, including the first and the last.
 *
 * This is what makes the non-monotonicity of a fold a non-issue. A band leaving
 * buys back `BAND.minWidth + BAND.columnGap` while the counter arriving costs
 * `EXTRA_BAND_WIDTH + BAND.columnGap`, which is more — so folding can make a row
 * WORSE, and any loop that folds "until free space is enough" runs off the end of
 * the row. Here nothing is ever folded: the loop only ever admits, and it checks
 * the real number each time.
 *
 * ## Why no parent can end up empty
 *
 * The unit of admission is a LEAF together with its ancestors. So every shown
 * cluster is either a leaf or has a shown descendant leaf, which means it has a
 * shown child. A parent that shows nothing but a counter is unreachable. A parent
 * nobody could afford is not shown at all — it folds into its own row's counter,
 * band included.
 */
function chooseShown(forest: ViewNode[], width: number): Set<string> {
  const budget = width * (1 - FREE_SPACE_TARGET);

  const parentOf = new Map<string, ViewNode>();
  const leaves: ViewNode[] = [];
  const walk = (nodes: ViewNode[], parent: ViewNode | null) => {
    for (const n of nodes) {
      if (parent) parentOf.set(n.id, parent);
      if (n.children.length === 0) leaves.push(n);
      walk(n.children, n);
    }
  };
  walk(forest, null);

  const shown = new Set<string>();
  const need = new Map<string, number>();

  // What one column needs, given what is currently shown beneath it. Folded
  // siblings collapse into one counter PER LEVEL: a row can mix levels (an orphan
  // sits next to a proper root), and a counter has to stand on the row of the
  // clusters it stands for.
  const entriesOf = (children: ViewNode[]): number[] => {
    const entries: number[] = [];
    const foldedLevels = new Set<number>();
    for (const c of children) {
      if (shown.has(c.id)) entries.push(need.get(c.id) ?? BAND.minWidth);
      else foldedLevels.add(c.level);
    }
    for (let i = 0; i < foldedLevels.size; i++) entries.push(EXTRA_BAND_WIDTH);
    return entries;
  };
  const nodeNeed = (n: ViewNode) => rowNeed(entriesOf(n.children), childRowGap(n.level));
  // The strip itself is a row of roots: `groupGap` between them, and no panel to
  // pad, since nothing contains it.
  const currentStripNeed = () => {
    const entries = entriesOf(forest);
    return entries.length === 0 ? 0 : entries.reduce((sum, n) => sum + n, 0) + (entries.length - 1) * BAND.groupGap;
  };

  const ordered = [...leaves].sort((a, b) => b.total - a.total);

  /**
   * Admit one leaf, together with every ancestor it needs — that is the unit, and
   * it is the ONLY way anything enters `shown`.
   *
   * Admission is measured, not estimated: the strip's exact need is recomputed
   * with the same `rowNeed` that later writes each column's `min-width`, and the
   * whole path is rolled back if the answer is over budget. So the invariant
   * `stripNeed <= budget` holds after every call, whoever made it.
   */
  const tryAdmit = (leaf: ViewNode): boolean => {
    if (shown.has(leaf.id)) return false;
    const path: ViewNode[] = [];
    for (let n: ViewNode | undefined = leaf; n; n = parentOf.get(n.id)) path.unshift(n);

    const before = path.map((n) => ({ n, was: shown.has(n.id), need: need.get(n.id) }));
    for (const n of path) shown.add(n.id);
    // Bottom-up: a parent's need is a function of its children's.
    for (let i = path.length - 1; i >= 0; i--) need.set(path[i].id, nodeNeed(path[i]));

    if (currentStripNeed() > budget) {
      for (const s of before) {
        if (!s.was) shown.delete(s.n.id);
        if (s.need === undefined) need.delete(s.n.id);
        else need.set(s.n.id, s.need);
      }
      return false;
    }
    return true;
  };

  for (const leaf of ordered) tryAdmit(leaf);

  // A counter standing for ONE cluster is strictly worse than the cluster: it
  // takes a row entry either way and says less with it. So no row is allowed to
  // keep one.
  //
  // A lone folded PARENT cannot simply be swapped in for its counter: it would
  // arrive with an empty children row, and a parent showing nothing is the one
  // shape the fold must never produce. It has to arrive the way everything else
  // does, with a leaf under it, so it goes through `tryAdmit` — measured,
  // budget-checked, and rolled back if the strip genuinely cannot pay.
  const lonelyFolds = (): ViewNode[] => {
    const out: ViewNode[] = [];
    const visit = (children: ViewNode[]) => {
      // Same grouping `applyFolds` uses to build the counters: one per level,
      // because a row can mix levels and a counter stands on the row of what it
      // stands for. A group of one is a "+1".
      const byLevel = new Map<number, ViewNode[]>();
      for (const c of children) {
        if (shown.has(c.id)) {
          visit(c.children);
          continue;
        }
        const group = byLevel.get(c.level);
        if (group) group.push(c);
        else byLevel.set(c.level, [c]);
      }
      for (const group of byLevel.values()) if (group.length === 1) out.push(group[0]);
    };
    visit(forest);
    return out;
  };

  const leavesUnder = (n: ViewNode): ViewNode[] => (n.children.length === 0 ? [n] : n.children.flatMap(leavesUnder));

  // Rescuing a lone parent opens its own children row, which can itself come up
  // one short — so this runs to a fixpoint rather than once. It terminates
  // because a pass that changes anything admits at least one leaf, and the forest
  // has finitely many.
  for (;;) {
    const loners = lonelyFolds();
    if (loners.length === 0) break;
    let progressed = false;
    for (const loner of loners) {
      // Biggest leaf first: if only one descendant can be afforded, it should be
      // the same one the main pass would have picked.
      for (const leaf of leavesUnder(loner).sort((a, b) => b.total - a.total)) {
        if (tryAdmit(leaf)) {
          progressed = true;
          break;
        }
      }
    }
    if (!progressed) break;
  }

  return shown;
}

/**
 * The chain of beads hanging under a counter — see `ViewNode.isBead`.
 *
 * One bead per row that has anything on it, standing for every cluster that
 * folded away on that row. It costs the strip no width: a bead sits in its
 * parent's column, and every counter is budgeted at the same `EXTRA_BAND_WIDTH`
 * bound, so the column is as wide as its widest bead and no wider.
 *
 * The deepest bead carries whatever `foldedDepth` is left over. A group whose
 * members are leaves grows no beads at all, and then the counter keeps the whole
 * of it.
 */
function beadChain(parents: ViewNode[], parentId: string, finest: number): ViewNode[] {
  const kids = parents.flatMap((p) => p.children);
  if (kids.length === 0) return [];
  // A folded group can straddle levels, so the bead stands on the coarsest row
  // any of its clusters is on — the row it is actually drawn against.
  const level = kids.reduce((max, k) => Math.max(max, k.level), -Infinity);
  const id = `${parentId}_bead${level}`;
  const children = beadChain(kids, id, finest);
  return [
    {
      id,
      name: `+${kids.length}`,
      color: EXTRA.color,
      total: kids.reduce((sum, n) => sum + n.total, 0),
      level,
      parentId,
      children,
      isExtra: true,
      isBead: true,
      foldedDepth: children.length === 0 ? level - finest : 0,
      // Carried so a bead lights up with the counter it hangs off when the
      // focused cluster is one of the ones it stands for.
      extra: [...kids].sort((a, b) => b.total - a.total),
    },
  ];
}

/**
 * Rebuild the forest keeping only what `shown` admitted, with each row's folded
 * clusters replaced by one extra-clusters counter per level.
 */
function applyFolds(nodes: ViewNode[], shown: Set<string>, finest: number): ViewNode[] {
  // `all` is the pre-fold children, captured before the recursion rewrites
  // `children`. Nothing else about the fold changes: a list shows real clusters,
  // a row shows what fits.
  const kept: ViewNode[] = nodes
    .filter((n) => shown.has(n.id))
    .map((n) => ({
      ...n,
      all: n.children,
      children: applyFolds(n.children, shown, finest),
      // A real cluster with nothing inside it is one row tall too. On any row but
      // the finest, `items-end` would drop it a level.
      foldedDepth: n.children.length === 0 ? n.level - finest : 0,
    }));

  const gone = nodes.filter((n) => !shown.has(n.id));
  if (gone.length === 0) return kept;

  // One counter per level. A row can mix levels — an orphan L1 sits beside a
  // proper L3 root — and a counter has to stand on the row of the clusters it
  // stands for, or it reads as a level it isn't.
  const byLevel = new Map<number, ViewNode[]>();
  for (const n of gone) {
    const group = byLevel.get(n.level);
    if (group) group.push(n);
    else byLevel.set(n.level, [n]);
  }
  const counters = [...byLevel.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([level, group]) => {
      const id = `__extra_${group[0].parentId ?? "root"}_l${level}__`;
      const beads = beadChain(group, id, finest);
      return {
        id,
        name: `+${group.length}`,
        color: EXTRA.color,
        total: group.reduce((sum, n) => sum + n.total, 0),
        level,
        parentId: group[0].parentId,
        children: beads,
        isExtra: true,
        // It stands on level `level`'s row, so it has to be as tall as that row's
        // real columns — every level between it and the finest one. Beads are
        // real rows and fill that themselves, so the spacer only covers what is
        // left below the last one.
        foldedDepth: beads.length === 0 ? level - finest : 0,
        // Kept whole, not just counted: the counter's tooltip is the only way
        // into these clusters, so it needs them, biggest first.
        extra: [...group].sort((a, b) => b.total - a.total),
      };
    });
  return [...kept, ...counters];
}

/**
 * Widest thing each column has to contain, bottom-up — the number the browser's
 * flex layout is actually held to, as the column's `min-width`.
 *
 * A column's width comes from its `flexGrow` share, but its children's floors do
 * not: a row of six children cannot be narrower than `6 * minWidth + gaps`,
 * whatever share the parent won. Nothing reconciles the two on its own — the
 * column carries `min-w-0`, which is what switches OFF flex's automatic content
 * minimum — so a parent narrower than its own children lets that row spill
 * sideways and paint over the neighbouring column.
 *
 * The panel inset is counted whether or not the cluster is focused: it is a
 * minimum, so it only binds when the row is already tight, and paying for it up
 * front means focusing a cluster can never be what pushes a row into overflow.
 */
function annotateNeed(nodes: ViewNode[]): ViewNode[] {
  return nodes.map((node) => {
    // The counter hugs its own label, so this is a bound rather than its width —
    // see `EXTRA_BAND_WIDTH`. It is not applied as a `min-width`; only the rows
    // above it budget with it.
    if (node.isExtra) return { ...node, need: EXTRA_BAND_WIDTH };
    const children = annotateNeed(node.children);
    const entries = children.map((c) => c.need ?? BAND.minWidth);
    return { ...node, children, need: rowNeed(entries, childRowGap(node.level)) };
  });
}

/** What the strip cannot shrink below: the roots' own needs, `groupGap` apart. */
export function stripNeed(view: ViewNode[]): number {
  if (view.length === 0) return 0;
  return view.reduce((sum, n) => sum + (n.need ?? BAND.minWidth), 0) + (view.length - 1) * BAND.groupGap;
}

/**
 * The strip's own view of the forest: same clusters, each row cut to the handful
 * it has width for.
 */
export function buildView(tree: ClusterNode[], stripWidth: number): ViewNode[] {
  const forest = tree as ViewNode[];
  // Before the first measurement there is no width to divide by, so nothing
  // folds — one frame of the full strip beats one frame of everything folded.
  if (stripWidth <= 0 || forest.length === 0) return forest;

  const finest = finestLevel(forest, Infinity);
  return annotateNeed(applyFolds(forest, chooseShown(forest, stripWidth), finest));
}
