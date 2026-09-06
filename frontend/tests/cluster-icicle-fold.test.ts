// The icicle strip's fold, tested at the seam.
//
// Every bug in here has been arithmetic — a row of nothing but "+N" counters, a
// column that lost its height, a row that overflowed — and arithmetic does not
// need a DOM to catch.
//
// The one rule this file must never break: the width it checks against is the
// `need` that `buildView` ACTUALLY RETURNS, read off the view. An earlier version
// re-derived the strip's minimum with its own formula, inherited the same missing
// term the algorithm had, and so passed green while the browser overflowed.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FREE_SPACE_TARGET } from "../components/signal/clusters-section/cluster-icicle/constants";
import {
  buildView,
  EXTRA_BAND_WIDTH,
  stripNeed,
  type ViewNode,
} from "../components/signal/clusters-section/cluster-icicle/fold";
import { type ClusterNode } from "../components/signal/clusters-section/model";

let seq = 0;

function leaf(parentId: string | null): ClusterNode {
  // Uneven sizes, so "admit the biggest first" has something to sort by and a
  // row of the SMALLEST clusters would not pass by accident.
  const total = 1 + ((seq * 37) % 90);
  const node: ClusterNode = {
    id: `c${seq}`,
    name: `cluster ${seq}`,
    color: "#888888",
    level: 1,
    parentId,
    total,
    children: [],
  };
  seq++;
  return node;
}

function branch(level: number, parentId: string | null, fanout: number): ClusterNode {
  const id = `c${seq++}`;
  const children =
    level === 2
      ? Array.from({ length: fanout }, () => leaf(id))
      : Array.from({ length: fanout }, () => branch(2, id, fanout));
  return {
    id,
    name: `cluster ${id}`,
    color: "#888888",
    level,
    parentId,
    // Rolled up, the way the real model does it — a parent's total contains its
    // children's, which is what the strip's proportional split assumes.
    total: children.reduce((sum, c) => sum + c.total, 0),
    children,
  };
}

/**
 * A forest with every shape that has ever broken the strip: proper L3→L2→L1
 * chains, an L2 whose parent is missing, and bare L1s with no parent at all.
 *
 * The orphans are the point. Incremental clustering leaves them constantly, and
 * they are what makes the TOP row mix levels — an orphan L1 root standing beside
 * a real L3 — which is where the stray-pill and lone-counter bugs both lived.
 */
const TREE: ClusterNode[] = [
  branch(3, null, 3),
  branch(3, null, 4),
  branch(2, null, 5),
  ...Array.from({ length: 6 }, () => leaf(null)),
];

/** Panel-narrow to ultrawide. The strip's width is its one live input — it is
 *  whatever the browser hands the section — so the invariants have to hold at
 *  widths nobody has looked at, not just at a few round numbers. */
const WIDTHS = Array.from({ length: 45 }, (_, i) => 240 + i * 40);

function every(nodes: ViewNode[], visit: (n: ViewNode) => void) {
  for (const n of nodes) {
    visit(n);
    every(n.children, visit);
  }
}

/** Rows this column occupies, counting the spacer it renders for the levels it
 *  stands over. `node.tsx` draws exactly this: band + `foldedDepth` spacer rows
 *  + one row per level of children. */
function rowsTall(node: ViewNode): number {
  const below = node.children.length > 0 ? Math.max(...node.children.map(rowsTall)) : 0;
  return 1 + (node.foldedDepth ?? 0) + below;
}

/** Clusters one row below the ones a counter stands for — what its first bead
 *  counts. */
const childrenOf = (nodes: ViewNode[]) => nodes.flatMap((n) => n.children);

describe("icicle fold", () => {
  // THE constraint. `stripNeed` sums the `need` that `annotateNeed` wrote onto
  // the view — the same numbers the columns carry as `min-width` — so this is the
  // browser's own floor, not a second opinion about it.
  it("keeps free space at or above the target, at every width", () => {
    for (const w of WIDTHS) {
      const free = w - stripNeed(buildView(TREE, w));
      assert.ok(
        free >= w * FREE_SPACE_TARGET - 1e-9,
        `${w}px: free space ${free.toFixed(0)}px, target ${(w * FREE_SPACE_TARGET).toFixed(0)}px`
      );
    }
  });

  // A band that advertises sub-clusters and then shows a blank where they should
  // be is worse than not drawing the band at all.
  it("never leaves a parent showing only a counter", () => {
    for (const w of WIDTHS) {
      every(buildView(TREE, w), (n) => {
        if (n.isExtra || n.children.length === 0) return;
        assert.ok(
          n.children.some((c) => !c.isExtra),
          `${w}px: "${n.name}" (L${n.level}) shows nothing but a counter`
        );
      });
    }
  });

  // A counter standing for ONE cluster takes a row entry to say less than the
  // cluster's own band would.
  //
  // Not "never": a deep subtree really can cost more than the pill standing in
  // for it, and the fold does not bankrupt the strip to avoid a "+1". So the test
  // is that a "+1" only survives on a strip that is out of budget.
  it("never stands a counter in for a single cluster it could afford", () => {
    for (const w of WIDTHS) {
      const view = buildView(TREE, w);
      const slack = w * (1 - FREE_SPACE_TARGET) - stripNeed(view);
      every(view, (n) => {
        // A bead is not a fold decision — it hangs off a counter and costs
        // nothing, so a "+1" bead is a true statement about one folded cluster.
        if (!n.isExtra || n.isBead || (n.extra ?? []).length > 1) return;
        assert.ok(slack < EXTRA_BAND_WIDTH, `${w}px: a "+1" with ${slack.toFixed(0)}px of budget going spare`);
      });
    }
  });

  // A column's height is what places its band on a row. Rows are `items-end`, so
  // a column one row short of its level drops onto a finer level's row — which is
  // how a counter for folded L2s ended up as a stray pill on the L1 row, twice.
  // The finest level here is L1, so a column's height IS its level.
  it("gives every column exactly the height its level demands", () => {
    for (const w of WIDTHS) {
      every(buildView(TREE, w), (n) => {
        assert.equal(rowsTall(n), n.level, `${w}px: "${n.name}" on L${n.level} stands ${rowsTall(n)} rows tall`);
      });
    }
  });

  // When a parent folds its children fold with it, so the counter would otherwise
  // stand alone on its row while every real band beside it has a row hanging off
  // it. The bead chain is what fills those rows.
  it("grows one bead per row under a counter that folded parents", () => {
    let sawChain = false;
    for (const w of WIDTHS) {
      every(buildView(TREE, w), (n) => {
        if (!n.isExtra) return;
        const kids = childrenOf(n.extra ?? []);
        if (kids.length === 0) {
          assert.equal(n.children.length, 0, `${w}px: "${n.name}" grew a bead over nothing but leaves`);
          return;
        }
        sawChain = true;
        assert.equal(n.children.length, 1, `${w}px: "${n.name}" grew ${n.children.length} beads on one row`);
        const bead = n.children[0];
        assert.ok(bead.isBead && bead.isExtra, `${w}px: "${n.name}" hung a real band under a counter`);
        // The bead reads how many clusters folded away on ITS row, and carries
        // them so it can light up with the counter it hangs off.
        assert.equal(bead.name, `+${kids.length}`);
        assert.equal((bead.extra ?? []).length, kids.length);
        assert.ok(bead.level < n.level, `${w}px: bead "${bead.name}" stands on its parent's own row`);
      });
    }
    assert.ok(sawChain, "no width folded a parent, so the bead chain was never exercised");
  });

  // Only the counter at the top of a chain answers the pointer; a bead is a
  // readout, not a way in. That holds because a bead is only ever reachable
  // through a counter.
  it("hangs every bead under a counter", () => {
    for (const w of WIDTHS) {
      const view = buildView(TREE, w);
      assert.ok(!view.some((n) => n.isBead), `${w}px: a bead stands on the strip's top row`);
      every(view, (n) => {
        if (!n.children.some((c) => c.isBead)) return;
        assert.ok(n.isExtra, `${w}px: "${n.name}" is a real band with a bead under it`);
      });
    }
  });
});
