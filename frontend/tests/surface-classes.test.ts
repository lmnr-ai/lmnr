import assert from "node:assert/strict";
import { test } from "node:test";

import { surfaceClasses } from "@/components/ui/surface/classes";

test("surfaceClasses maps a level to its bg + shadow utility", () => {
  assert.equal(surfaceClasses(1), "bg-surface-1 shadow-surface-1");
  assert.equal(surfaceClasses(3), "bg-surface-3 shadow-surface-3");
  assert.equal(surfaceClasses(8), "bg-surface-8 shadow-surface-8");
});

test("surfaceClasses pins the shadow level independently of the background", () => {
  // A dropdown at level 5 that always reads shadow-surface-3.
  assert.equal(surfaceClasses(5, 3), "bg-surface-5 shadow-surface-3");
});

test("surfaceClasses clamps out-of-range levels to 1..8", () => {
  assert.equal(surfaceClasses(0), "bg-surface-1 shadow-surface-1");
  assert.equal(surfaceClasses(-4), "bg-surface-1 shadow-surface-1");
  assert.equal(surfaceClasses(12), "bg-surface-8 shadow-surface-8");
  assert.equal(surfaceClasses(5, 99), "bg-surface-5 shadow-surface-8");
});

test("surfaceClasses rounds fractional levels so it never indexes out of the table", () => {
  assert.equal(surfaceClasses(2.4), "bg-surface-2 shadow-surface-2");
  assert.equal(surfaceClasses(2.6), "bg-surface-3 shadow-surface-3");
});
