import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeEffectiveOrder } from "@/components/ui/infinite-datatable/model/datatable-store";

describe("computeEffectiveOrder", () => {
  it("returns available ids in input order when no persisted state", () => {
    assert.deepStrictEqual(computeEffectiveOrder([], ["a", "b", "c"], []), ["a", "b", "c"]);
  });

  it("appends newcomers (in input order) after persisted ids", () => {
    assert.deepStrictEqual(computeEffectiveOrder(["b", "a"], ["a", "b", "c", "d"], []), ["b", "a", "c", "d"]);
  });

  it("drops persisted ids that are no longer available", () => {
    assert.deepStrictEqual(computeEffectiveOrder(["x", "a", "y", "b"], ["a", "b"], []), ["a", "b"]);
  });

  it("places pinned ids first in pinned-array order", () => {
    assert.deepStrictEqual(computeEffectiveOrder(["a", "b", "c"], ["a", "b", "c"], ["c", "a"]), ["c", "a", "b"]);
  });

  it("keeps pinned positions even when persisted order contradicts them", () => {
    assert.deepStrictEqual(computeEffectiveOrder(["b", "a", "c"], ["a", "b", "c"], ["a"]), ["a", "b", "c"]);
  });

  it("ignores pinned ids that are not available", () => {
    assert.deepStrictEqual(computeEffectiveOrder(["a", "b"], ["a", "b"], ["missing", "a"]), ["a", "b"]);
  });

  it("handles empty inputs", () => {
    assert.deepStrictEqual(computeEffectiveOrder([], [], []), []);
  });
});
