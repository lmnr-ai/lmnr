import assert from "node:assert/strict";
import { test } from "node:test";

import { borderForLevel, surfaceClasses } from "@/components/ui/surface/classes";

test("surfaceClasses maps a level (1..8) to its hundreds bg + shadow utility", () => {
  assert.equal(surfaceClasses(1), "bg-surface-100 shadow-elevation-100");
  assert.equal(surfaceClasses(3), "bg-surface-300 shadow-elevation-300");
  assert.equal(surfaceClasses(8), "bg-surface-800 shadow-elevation-800");
});

test("surfaceClasses pins the shadow level independently of the background", () => {
  // A dropdown at level 5 that always reads shadow-elevation-300.
  assert.equal(surfaceClasses(5, 3), "bg-surface-500 shadow-elevation-300");
});

test("surfaceClasses clamps out-of-range levels to 1..8", () => {
  assert.equal(surfaceClasses(0), "bg-surface-100 shadow-elevation-100");
  assert.equal(surfaceClasses(-4), "bg-surface-100 shadow-elevation-100");
  assert.equal(surfaceClasses(12), "bg-surface-800 shadow-elevation-800");
  assert.equal(surfaceClasses(5, 99), "bg-surface-500 shadow-elevation-800");
});

test("surfaceClasses rounds fractional levels so it never indexes out of the table", () => {
  assert.equal(surfaceClasses(2.4), "bg-surface-200 shadow-elevation-200");
  assert.equal(surfaceClasses(2.6), "bg-surface-300 shadow-elevation-300");
});

test("borderForLevel picks a border two stops lighter, clamped to the top", () => {
  assert.equal(borderForLevel(1), "border-surface-300");
  assert.equal(borderForLevel(4), "border-surface-600");
  assert.equal(borderForLevel(7), "border-surface-800");
  assert.equal(borderForLevel(8), "border-surface-800");
});
