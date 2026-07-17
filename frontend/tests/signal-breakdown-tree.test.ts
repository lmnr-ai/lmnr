import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPath,
  buildTree,
  collectDescendantIds,
  countsByBucket,
  findNodeById,
  type FlatBreakdownNode,
  isLeaf,
  rangeTotal,
  visibleChildren,
} from "@/components/signal/signal-breakdown/tree";

// Minimal flat-node factory — the tree functions only touch id/parentId/children.
const n = (id: string, parentId: string | null): FlatBreakdownNode => ({
  id,
  name: id,
  parentId,
  icon: { type: "dot", filled: true, color: "x" },
  color: "x",
});

describe("signal-breakdown tree", () => {
  it("nests by parentId; orphaned/null parents become roots", () => {
    const roots = buildTree([n("a", null), n("a1", "a"), n("a2", "a"), n("b", null), n("orphan", "missing")]);
    assert.deepEqual(
      roots.map((r) => r.id),
      ["a", "b", "orphan"]
    );
    assert.deepEqual(
      findNodeById(roots, "a")!.children.map((c) => c.id),
      ["a1", "a2"]
    );
  });

  it("flat dimensions produce depth-1 trees (every node a root)", () => {
    const roots = buildTree([n("critical", null), n("warning", null), n("info", null)]);
    assert.equal(roots.length, 3);
    assert.ok(roots.every((r) => r.children.length === 0));
  });

  it("buildPath returns root→target inclusive", () => {
    const roots = buildTree([n("a", null), n("a1", "a"), n("a1x", "a1")]);
    assert.deepEqual(
      buildPath(roots, "a1x").map((p) => p.id),
      ["a", "a1", "a1x"]
    );
  });

  it("collectDescendantIds includes self + all descendants", () => {
    const roots = buildTree([n("a", null), n("a1", "a"), n("a1x", "a1"), n("a2", "a")]);
    assert.deepEqual(collectDescendantIds(findNodeById(roots, "a")!).sort(), ["a", "a1", "a1x", "a2"]);
  });

  it("visibleChildren + isLeaf", () => {
    const roots = buildTree([n("a", null), n("a1", "a")]);
    assert.deepEqual(
      visibleChildren(roots, null).map((r) => r.id),
      ["a"]
    );
    assert.deepEqual(
      visibleChildren(roots, "a").map((r) => r.id),
      ["a1"]
    );
    assert.equal(isLeaf(roots, "a1"), true);
    assert.equal(isLeaf(roots, "a"), false);
    assert.equal(isLeaf(roots, null), false);
  });

  it("countsByBucket seeds zeros then sums stats", () => {
    const counts = countsByBucket(
      [
        { bucketId: "a", count: 3 },
        { bucketId: "a", count: 2 },
        { bucketId: "b", count: 1 },
      ],
      ["a", "b", "c"]
    );
    assert.equal(counts.get("a"), 5);
    assert.equal(counts.get("b"), 1);
    assert.equal(counts.get("c"), 0); // seeded, no stats
  });

  it("rangeTotal sums only root buckets (each event counted once)", () => {
    const roots = buildTree([n("a", null), n("a1", "a"), n("b", null)]);
    // a1 is a child; its count must NOT be double-added on top of root a.
    const total = rangeTotal(roots, [
      { bucketId: "a", count: 10 },
      { bucketId: "a1", count: 4 },
      { bucketId: "b", count: 5 },
    ]);
    assert.equal(total, 15);
  });
});
