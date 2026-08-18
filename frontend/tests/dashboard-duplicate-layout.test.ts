import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveDuplicateLayout } from "@/lib/actions/dashboard";

type Layout = { x: number; y: number; w: number; h: number };

const overlaps = (a: Layout, b: Layout) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Mirrors react-grid-layout's vertical compaction: each item floats up in y order
// until it would collide. The grid persists the compacted result via its own
// layout PATCH, so a slot is only correct if it survives this.
const compact = (items: Array<Layout & { id: string }>) => {
  const settled: Array<Layout & { id: string }> = [];

  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const floated = { ...item };
    while (floated.y > 0 && !settled.some((other) => overlaps({ ...floated, y: floated.y - 1 }, other))) {
      floated.y--;
    }
    settled.push(floated);
  }

  return settled;
};

// The full server-side placement: pick the slot, push whatever occupies it below,
// then let the grid compact.
const place = (source: Layout, others: Layout[]) => {
  const slot = resolveDuplicateLayout(source, others);
  const shifted = others.map((o) => (overlaps(o, slot) ? { ...o, y: slot.y + slot.h } : o));

  const settled = compact([
    { id: "source", ...source },
    { id: "copy", ...slot },
    ...shifted.map((o, i) => ({ id: `other-${i}`, ...o })),
  ]);

  return {
    slot,
    source: settled.find((i) => i.id === "source")!,
    copy: settled.find((i) => i.id === "copy")!,
    settled,
  };
};

const isAdjacent = (source: Layout, copy: Layout) =>
  (copy.x === source.x + source.w && copy.y === source.y) || (copy.x === source.x && copy.y === source.y + source.h);

describe("resolveDuplicateLayout", () => {
  const cases: Array<{ name: string; source: Layout; others: Layout[] }> = [
    {
      name: "uniform row with the beside-slot occupied",
      source: { x: 0, y: 0, w: 4, h: 6 },
      others: [
        { x: 4, y: 0, w: 4, h: 6 },
        { x: 8, y: 0, w: 4, h: 6 },
      ],
    },
    {
      // A fixed shift by the copy's height leaves this neighbour still covering
      // the slot, because it starts above it.
      name: "taller neighbour starting above the beside-slot",
      source: { x: 0, y: 6, w: 4, h: 6 },
      others: [
        { x: 0, y: 0, w: 4, h: 6 },
        { x: 4, y: 0, w: 4, h: 12 },
        { x: 8, y: 0, w: 4, h: 6 },
      ],
    },
    {
      name: "rightmost source, no room beside",
      source: { x: 8, y: 0, w: 4, h: 4 },
      others: [
        { x: 0, y: 0, w: 8, h: 6 },
        { x: 8, y: 4, w: 4, h: 12 },
      ],
    },
    {
      name: "staggered neighbours starting on different rows",
      source: { x: 0, y: 6, w: 4, h: 6 },
      others: [
        { x: 0, y: 0, w: 4, h: 6 },
        { x: 4, y: 2, w: 4, h: 8 },
        { x: 4, y: 10, w: 4, h: 6 },
        { x: 8, y: 0, w: 4, h: 6 },
      ],
    },
    {
      name: "source on the second row of a uniform grid",
      source: { x: 0, y: 6, w: 4, h: 6 },
      others: [
        { x: 0, y: 0, w: 4, h: 6 },
        { x: 4, y: 0, w: 4, h: 6 },
        { x: 8, y: 0, w: 4, h: 6 },
        { x: 4, y: 6, w: 4, h: 6 },
        { x: 8, y: 6, w: 4, h: 6 },
      ],
    },
    {
      name: "half-width source with a taller neighbour",
      source: { x: 0, y: 0, w: 6, h: 6 },
      others: [{ x: 6, y: 0, w: 6, h: 10 }],
    },
    {
      name: "beside-slot already free",
      source: { x: 0, y: 0, w: 4, h: 6 },
      others: [{ x: 8, y: 0, w: 4, h: 6 }],
    },
  ];

  for (const { name, source, others } of cases) {
    it(`keeps the copy next to its source: ${name}`, () => {
      const { source: settledSource, copy, settled } = place(source, others);

      assert.ok(
        isAdjacent(settledSource, copy),
        `copy at (${copy.x},${copy.y}) is not adjacent to source at (${settledSource.x},${settledSource.y})`
      );

      for (let i = 0; i < settled.length; i++) {
        for (let j = i + 1; j < settled.length; j++) {
          assert.ok(!overlaps(settled[i], settled[j]), `${settled[i].id} overlaps ${settled[j].id} after compaction`);
        }
      }
    });
  }

  it("never places a copy outside the grid", () => {
    for (const { source, others } of cases) {
      const slot = resolveDuplicateLayout(source, others);
      assert.ok(slot.x >= 0 && slot.x + slot.w <= 12, `slot ${JSON.stringify(slot)} escapes the 12-column grid`);
    }
  });

  it("preserves the source's dimensions", () => {
    for (const { source, others } of cases) {
      const slot = resolveDuplicateLayout(source, others);
      assert.equal(slot.w, source.w);
      assert.equal(slot.h, source.h);
    }
  });
});
