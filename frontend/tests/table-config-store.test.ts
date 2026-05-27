import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeEffectiveOrder, reconcileConfig } from "@/components/ui/infinite-datatable/model/table-config-store";

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

describe("reconcileConfig", () => {
  it("restores stripped system columns at the front of the default order", () => {
    // Simulates loading a view whose persisted config was normalized to drop
    // `__row_selection` (normalize.ts strips `__`-prefixed ids). Without the
    // fix, `__row_selection` would land at the end of columnOrder.
    const { config } = reconcileConfig(
      { columnOrder: ["name", "createdAt"] },
      { columnOrder: ["__row_selection", "name", "createdAt"] }
    );
    assert.deepStrictEqual(config.columnOrder, ["__row_selection", "name", "createdAt"]);
  });

  it("preserves user-reordered non-system columns when restoring a system column", () => {
    const { config } = reconcileConfig(
      { columnOrder: ["createdAt", "name"] },
      { columnOrder: ["__row_selection", "name", "createdAt"] }
    );
    assert.deepStrictEqual(config.columnOrder, ["__row_selection", "createdAt", "name"]);
  });

  it("still appends genuinely new default columns at the end", () => {
    const { config } = reconcileConfig(
      { columnOrder: ["name", "createdAt"] },
      { columnOrder: ["__row_selection", "name", "createdAt", "newField"] }
    );
    assert.deepStrictEqual(config.columnOrder, ["__row_selection", "name", "createdAt", "newField"]);
  });

  it("does not flag stripped system columns as purged drift", () => {
    const { purged } = reconcileConfig(
      { columnOrder: ["name", "createdAt"] },
      { columnOrder: ["__row_selection", "name", "createdAt"] }
    );
    assert.strictEqual(purged, false);
  });
});
