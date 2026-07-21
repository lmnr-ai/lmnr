import assert from "node:assert/strict";
import { test } from "node:test";

import { borderForLevel, raiseVar, surfaceClasses } from "@/components/ui/surface/classes";

test("surfaceClasses maps a level (1..8) to bg + shadow + the raise var it publishes", () => {
  assert.equal(surfaceClasses(1), "bg-surface-100 shadow-elevation-100 [--surface-raise:var(--color-surface-200)]");
  assert.equal(surfaceClasses(3), "bg-surface-300 shadow-elevation-300 [--surface-raise:var(--color-surface-400)]");
  assert.equal(surfaceClasses(8), "bg-surface-800 shadow-elevation-800 [--surface-raise:var(--color-surface-800)]");
});

test("surfaceClasses pins the shadow level independently of the background", () => {
  // A dropdown at level 5 that always reads shadow-elevation-300; raise still tracks bg.
  assert.equal(surfaceClasses(5, 3), "bg-surface-500 shadow-elevation-300 [--surface-raise:var(--color-surface-600)]");
});

test("surfaceClasses clamps out-of-range levels to 1..8", () => {
  assert.equal(surfaceClasses(0), "bg-surface-100 shadow-elevation-100 [--surface-raise:var(--color-surface-200)]");
  assert.equal(surfaceClasses(12), "bg-surface-800 shadow-elevation-800 [--surface-raise:var(--color-surface-800)]");
});

test("surfaceClasses rounds fractional levels so it never indexes out of the table", () => {
  assert.equal(surfaceClasses(2.4), "bg-surface-200 shadow-elevation-200 [--surface-raise:var(--color-surface-300)]");
  assert.equal(surfaceClasses(2.6), "bg-surface-300 shadow-elevation-300 [--surface-raise:var(--color-surface-400)]");
});

test("raiseVar publishes the fill one level lighter than the surface, clamped", () => {
  assert.equal(raiseVar(1), "[--surface-raise:var(--color-surface-200)]");
  assert.equal(raiseVar(7), "[--surface-raise:var(--color-surface-800)]");
  assert.equal(raiseVar(8), "[--surface-raise:var(--color-surface-800)]");
});

test("borderForLevel picks a border three stops lighter, clamped to the top", () => {
  assert.equal(borderForLevel(1), "border-surface-400");
  assert.equal(borderForLevel(4), "border-surface-700");
  assert.equal(borderForLevel(5), "border-surface-800");
  assert.equal(borderForLevel(8), "border-surface-800");
});
