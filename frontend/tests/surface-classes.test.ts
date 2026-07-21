import assert from "node:assert/strict";
import { test } from "node:test";

import { surfaceClasses } from "@/components/ui/surface/classes";

test("surfaceClasses maps a level (1..8) to its hundreds bg + shadow utility", () => {
  assert.equal(surfaceClasses(1), "bg-surface-100 shadow-surface-100");
  assert.equal(surfaceClasses(3), "bg-surface-300 shadow-surface-300");
  assert.equal(surfaceClasses(8), "bg-surface-800 shadow-surface-800");
});

test("surfaceClasses pins the shadow level independently of the background", () => {
  // A dropdown at level 5 that always reads shadow-surface-300.
  assert.equal(surfaceClasses(5, 3), "bg-surface-500 shadow-surface-300");
});

test("surfaceClasses clamps out-of-range levels to 1..8", () => {
  assert.equal(surfaceClasses(0), "bg-surface-100 shadow-surface-100");
  assert.equal(surfaceClasses(-4), "bg-surface-100 shadow-surface-100");
  assert.equal(surfaceClasses(12), "bg-surface-800 shadow-surface-800");
  assert.equal(surfaceClasses(5, 99), "bg-surface-500 shadow-surface-800");
});

test("surfaceClasses rounds fractional levels so it never indexes out of the table", () => {
  assert.equal(surfaceClasses(2.4), "bg-surface-200 shadow-surface-200");
  assert.equal(surfaceClasses(2.6), "bg-surface-300 shadow-surface-300");
});
