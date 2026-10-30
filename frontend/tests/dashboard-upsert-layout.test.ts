import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { autoPlace, type Layout, overlaps, settle, validateLayout } from "@/lib/actions/dashboard/layout";
import { type ChartUpsert, mergeSettings, resolveLayouts } from "@/lib/actions/dashboard/upsert-charts";

const l = (x: number, y: number, w: number, h: number): Layout => ({ x, y, w, h });

const chart = (id: string, layout: Layout) => ({
  id,
  name: "c",
  query: "SELECT 1",
  settings: { config: { type: "line" }, layout },
});

const upsert = (id: string | undefined, layout: Layout | undefined): ChartUpsert => ({
  id,
  name: "n",
  query: "SELECT 1",
  config: { type: "line" },
  layout,
});

describe("autoPlace", () => {
  it("uses the shortest column", () => {
    assert.deepEqual(autoPlace([l(0, 0, 4, 12), l(4, 0, 4, 6), l(8, 0, 4, 9)]), l(4, 6, 4, 6));
  });

  it("accounts for wide charts", () => {
    assert.deepEqual(autoPlace([l(0, 2, 8, 6)]), l(8, 0, 4, 6));
  });
});

describe("settle", () => {
  it("pushes an overlapping chart below a fixed one", () => {
    assert.deepEqual(settle([l(0, 0, 6, 4)], [["a", l(0, 2, 4, 4)]]), [["a", l(0, 4, 4, 4)]]);
  });

  it("leaves clear charts alone", () => {
    assert.deepEqual(settle([l(0, 0, 6, 4)], [["a", l(6, 0, 6, 4)]]), [["a", l(6, 0, 6, 4)]]);
  });

  it("cascades and keeps vertical order", () => {
    const settled = settle(
      [l(0, 0, 12, 6)],
      [
        ["b", l(0, 6, 4, 6)],
        ["a", l(0, 3, 4, 4)],
      ]
    );
    assert.deepEqual(settled, [
      ["a", l(0, 6, 4, 4)],
      ["b", l(0, 10, 4, 6)],
    ]);
  });

  it("leaves no overlaps", () => {
    const fixed = [l(2, 1, 5, 3), l(8, 0, 4, 2)];
    const settled = settle(fixed, [
      [0, l(0, 0, 4, 2)],
      [1, l(3, 2, 6, 5)],
      [2, l(0, 3, 12, 1)],
      [3, l(9, 1, 3, 4)],
    ]);
    const all = [...fixed, ...settled.map(([, layout]) => layout)];
    for (const [i, a] of all.entries()) {
      for (const b of all.slice(i + 1))
        assert.ok(!overlaps(a, b), `${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`);
    }
  });
});

describe("validateLayout", () => {
  it("rejects layouts outside the grid", () => {
    assert.ok(validateLayout(l(10, 0, 4, 2)));
    assert.ok(validateLayout(l(0, 0, 0, 2)));
    assert.ok(validateLayout(l(-1, 0, 2, 2)));
    assert.equal(validateLayout(l(8, 0, 4, 2)), undefined);
  });
});

describe("resolveLayouts", () => {
  it("rejects overlapping explicit layouts", () => {
    assert.throws(
      () => resolveLayouts([upsert(undefined, l(0, 0, 6, 4)), upsert(undefined, l(3, 2, 6, 4))], []),
      /charts\[0\] and charts\[1\]/
    );
  });

  it("pushes untouched charts below explicit ones", () => {
    const other = randomUUID();
    const { entries, moved } = resolveLayouts([upsert(undefined, l(0, 0, 12, 4))], [chart(other, l(0, 0, 4, 6))]);
    assert.deepEqual(entries, [l(0, 0, 12, 4)]);
    assert.deepEqual(moved.get(other), l(0, 4, 4, 6));
  });

  it("moves nothing else on a full reset", () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const { entries, moved } = resolveLayouts(
      [upsert(a, l(0, 0, 12, 4)), upsert(b, l(0, 4, 12, 4))],
      [chart(a, l(0, 0, 4, 6)), chart(b, l(4, 0, 4, 6))]
    );
    assert.deepEqual(entries, [l(0, 0, 12, 4), l(0, 4, 12, 4)]);
    assert.equal(moved.size, 0);
  });

  it("keeps an updated chart's position when no layout is given", () => {
    const a = randomUUID();
    const { entries } = resolveLayouts([upsert(a, undefined)], [chart(a, l(4, 2, 4, 6))]);
    assert.deepEqual(entries, [l(4, 2, 4, 6)]);
  });

  it("auto-places new charts around everything", () => {
    const { entries } = resolveLayouts(
      [upsert(undefined, undefined), upsert(undefined, l(4, 0, 4, 3)), upsert(undefined, undefined)],
      [chart(randomUUID(), l(0, 0, 4, 6))]
    );
    assert.deepEqual(entries[0], l(8, 0, 4, 6));
    assert.deepEqual(entries[2], l(4, 3, 4, 6));
  });
});

describe("mergeSettings", () => {
  it("keeps settings the upsert leaves out", () => {
    const current = { config: { type: "bar" }, layout: l(0, 0, 4, 6), queryStructure: { table: "spans" } };
    const merged = mergeSettings(current, { id: randomUUID(), name: "renamed" }, l(0, 6, 4, 6));
    assert.deepEqual(merged, { config: { type: "bar" }, layout: l(0, 6, 4, 6), queryStructure: { table: "spans" } });
  });

  it("clears queryStructure when a query arrives without one", () => {
    const current = { config: { type: "bar" }, layout: l(0, 0, 4, 6), queryStructure: { table: "spans" } };
    const merged = mergeSettings(current, { query: "SELECT 2" }, l(0, 0, 4, 6));
    assert.equal(merged.queryStructure, null);
  });
});
