import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getStandaloneLevels, hideStandaloneLevels } from "@/lib/actions/clusters/standalone-levels";
import { type EventCluster } from "@/lib/actions/clusters/types";

const cluster = (id: string, level: number, parentId: string | null = null): EventCluster => ({
  id,
  name: id,
  parentId,
  level,
  numChildrenClusters: 0,
  numEvents: 1,
  createdAt: "",
  updatedAt: "",
});

const shape = (clusters: EventCluster[]) => clusters.map((c) => `${c.id}<-${c.parentId ?? "root"}`);

describe("getStandaloneLevels", () => {
  it("flags L2+ levels with exactly one cluster", () => {
    const levels = getStandaloneLevels([
      { level: 2, count: 1 },
      { level: 3, count: 1 },
      { level: 4, count: 2 },
    ]);
    assert.deepEqual([...levels].sort(), [2, 3]);
  });

  it("never flags L1", () => {
    assert.equal(getStandaloneLevels([{ level: 1, count: 1 }]).size, 0);
  });
});

describe("hideStandaloneLevels", () => {
  it("returns the input untouched when no level is standalone", () => {
    const clusters = [cluster("a", 1, "p"), cluster("p", 2)];
    assert.equal(hideStandaloneLevels(clusters, new Set()), clusters);
  });

  it("drops a lone L2 and makes its children roots", () => {
    const clusters = [cluster("p", 2), cluster("a", 1, "p"), cluster("b", 1, "p"), cluster("c", 1)];
    assert.deepEqual(shape(hideStandaloneLevels(clusters, new Set([2]))), ["a<-root", "b<-root", "c<-root"]);
  });

  it("re-hangs children on the nearest visible ancestor", () => {
    const clusters = [
      cluster("top", 3),
      cluster("top2", 3),
      cluster("mid", 2, "top"),
      cluster("a", 1, "mid"),
      cluster("b", 1, "top2"),
    ];
    assert.deepEqual(shape(hideStandaloneLevels(clusters, new Set([2]))), [
      "top<-root",
      "top2<-root",
      "a<-top",
      "b<-top2",
    ]);
  });

  it("skips several hidden levels in a row", () => {
    const clusters = [cluster("l3", 3), cluster("l2", 2, "l3"), cluster("a", 1, "l2")];
    assert.deepEqual(shape(hideStandaloneLevels(clusters, new Set([2, 3]))), ["a<-root"]);
  });

  it("terminates on a cyclic hidden chain", () => {
    const clusters = [cluster("x", 2, "y"), cluster("y", 3, "x"), cluster("a", 1, "x")];
    assert.deepEqual(shape(hideStandaloneLevels(clusters, new Set([2, 3]))), ["a<-root"]);
  });
});
