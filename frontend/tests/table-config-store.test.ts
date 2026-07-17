import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  asSavedViewConfig,
  computeEffectiveOrder,
  reconcileConfig,
} from "@/components/ui/infinite-datatable/model/table-config-store";

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

  it("preserves the saved order of namespaced dynamic columns absent from defaults", () => {
    // Evaluations score columns (`score:*`) / signal-event payload columns
    // (`payload:*`) arrive asynchronously and never appear in the static
    // defaults, so purging them would drop the user's saved order on reload.
    const { config } = reconcileConfig(
      { columnOrder: ["name", "score:f1", "score:accuracy", "createdAt"] },
      { columnOrder: ["__row_selection", "name", "createdAt"] }
    );
    assert.deepStrictEqual(config.columnOrder, ["__row_selection", "name", "score:f1", "score:accuracy", "createdAt"]);
  });

  it("does not flag namespaced dynamic columns as purged drift", () => {
    const { purged } = reconcileConfig(
      { columnOrder: ["name", "score:accuracy", "createdAt"] },
      { columnOrder: ["__row_selection", "name", "createdAt"] }
    );
    assert.strictEqual(purged, false);
  });

  it("preserves visibility and sizing for namespaced dynamic columns", () => {
    const { config } = reconcileConfig(
      {
        columnOrder: ["name", "score:accuracy"],
        columnVisibility: { "score:accuracy": false },
        columnSizing: { "score:accuracy": 200 },
      },
      { columnOrder: ["__row_selection", "name", "createdAt"] }
    );
    assert.deepStrictEqual(config.columnVisibility, { "score:accuracy": false });
    assert.deepStrictEqual(config.columnSizing, { "score:accuracy": 200 });
  });

  it("still purges unknown static (non-namespaced) columns as drift", () => {
    const { config, purged } = reconcileConfig(
      { columnOrder: ["name", "removedField", "createdAt"] },
      { columnOrder: ["__row_selection", "name", "createdAt"] }
    );
    assert.deepStrictEqual(config.columnOrder, ["__row_selection", "name", "createdAt"]);
    assert.strictEqual(purged, true);
  });
});

describe("asSavedViewConfig", () => {
  it("treats a missing columnVisibility as all-visible so default hidden columns don't leak in", () => {
    // A view saved when every column was visible persists NO columnVisibility
    // (normalizeViewConfig drops all-visible maps). Reconciling it against
    // defaults that now hide columns must not inherit those hidden defaults.
    const { config } = reconcileConfig(asSavedViewConfig({ columnOrder: ["name", "createdAt"] }), {
      columnOrder: ["name", "createdAt"],
      columnVisibility: { name: false },
    });
    assert.deepStrictEqual(config.columnVisibility, {});
  });

  it("keeps a saved view's explicit hidden columns", () => {
    const { config } = reconcileConfig(
      asSavedViewConfig({ columnOrder: ["name", "createdAt"], columnVisibility: { createdAt: false } }),
      { columnOrder: ["name", "createdAt"], columnVisibility: { name: false } }
    );
    assert.deepStrictEqual(config.columnVisibility, { createdAt: false });
  });

  it("without the wrapper, defaults still apply (default-view path)", () => {
    const { config } = reconcileConfig({}, { columnOrder: ["name", "createdAt"], columnVisibility: { name: false } });
    assert.deepStrictEqual(config.columnVisibility, { name: false });
  });
});
