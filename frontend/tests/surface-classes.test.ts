import assert from "node:assert/strict";
import { test } from "node:test";

import { raiseVar, surfaceClasses } from "@/components/ui/surface/classes";

const EDGE = "border-[color:var(--edge-border-color)]";

test("surfaceClasses maps a level (1..8) to bg + shadow + the raise var + the edge-border token", () => {
  assert.equal(surfaceClasses(1), `bg-surface-100 shadow-elevation-100 [--surface-raise:var(--color-surface-300)] ${EDGE}`);
  assert.equal(surfaceClasses(3), `bg-surface-300 shadow-elevation-300 [--surface-raise:var(--color-surface-500)] ${EDGE}`);
  assert.equal(surfaceClasses(8), `bg-surface-800 shadow-elevation-800 [--surface-raise:var(--color-surface-800)] ${EDGE}`);
});

test("surfaceClasses pins the shadow level independently of the background", () => {
  // A dropdown at level 5 that always reads shadow-elevation-300; raise still tracks bg.
  assert.equal(surfaceClasses(5, 3), `bg-surface-500 shadow-elevation-300 [--surface-raise:var(--color-surface-700)] ${EDGE}`);
});

test("surfaceClasses clamps out-of-range levels to 1..8", () => {
  assert.equal(surfaceClasses(0), `bg-surface-100 shadow-elevation-100 [--surface-raise:var(--color-surface-300)] ${EDGE}`);
  assert.equal(surfaceClasses(12), `bg-surface-800 shadow-elevation-800 [--surface-raise:var(--color-surface-800)] ${EDGE}`);
});

test("surfaceClasses rounds fractional levels so it never indexes out of the table", () => {
  assert.equal(surfaceClasses(2.4), `bg-surface-200 shadow-elevation-200 [--surface-raise:var(--color-surface-400)] ${EDGE}`);
  assert.equal(surfaceClasses(2.6), `bg-surface-300 shadow-elevation-300 [--surface-raise:var(--color-surface-500)] ${EDGE}`);
});

test("raiseVar publishes the fill two levels lighter than the surface, clamped", () => {
  assert.equal(raiseVar(1), "[--surface-raise:var(--color-surface-300)]");
  assert.equal(raiseVar(6), "[--surface-raise:var(--color-surface-800)]");
  assert.equal(raiseVar(8), "[--surface-raise:var(--color-surface-800)]");
});
