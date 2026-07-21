import assert from "node:assert/strict";
import { test } from "node:test";

import { borderVar, raiseVar, surfaceClasses } from "@/components/ui/surface/classes";

test("surfaceClasses maps a level (1..8) to bg + shadow + the raise & border vars it publishes", () => {
  assert.equal(
    surfaceClasses(1),
    "bg-surface-100 shadow-elevation-100 [--surface-raise:var(--color-surface-300)] [--surface-border:var(--surface-border-1)]"
  );
  assert.equal(
    surfaceClasses(3),
    "bg-surface-300 shadow-elevation-300 [--surface-raise:var(--color-surface-500)] [--surface-border:var(--surface-border-3)]"
  );
  assert.equal(
    surfaceClasses(8),
    "bg-surface-800 shadow-elevation-800 [--surface-raise:var(--color-surface-800)] [--surface-border:var(--surface-border-8)]"
  );
});

test("surfaceClasses pins the shadow level independently of the background", () => {
  // A dropdown at level 5 that always reads shadow-elevation-300; raise & border still track bg.
  assert.equal(
    surfaceClasses(5, 3),
    "bg-surface-500 shadow-elevation-300 [--surface-raise:var(--color-surface-700)] [--surface-border:var(--surface-border-5)]"
  );
});

test("surfaceClasses clamps out-of-range levels to 1..8", () => {
  assert.equal(
    surfaceClasses(0),
    "bg-surface-100 shadow-elevation-100 [--surface-raise:var(--color-surface-300)] [--surface-border:var(--surface-border-1)]"
  );
  assert.equal(
    surfaceClasses(12),
    "bg-surface-800 shadow-elevation-800 [--surface-raise:var(--color-surface-800)] [--surface-border:var(--surface-border-8)]"
  );
});

test("surfaceClasses rounds fractional levels so it never indexes out of the table", () => {
  assert.equal(
    surfaceClasses(2.4),
    "bg-surface-200 shadow-elevation-200 [--surface-raise:var(--color-surface-400)] [--surface-border:var(--surface-border-2)]"
  );
  assert.equal(
    surfaceClasses(2.6),
    "bg-surface-300 shadow-elevation-300 [--surface-raise:var(--color-surface-500)] [--surface-border:var(--surface-border-3)]"
  );
});

test("raiseVar publishes the fill two levels lighter than the surface, clamped", () => {
  assert.equal(raiseVar(1), "[--surface-raise:var(--color-surface-300)]");
  assert.equal(raiseVar(6), "[--surface-raise:var(--color-surface-800)]");
  assert.equal(raiseVar(8), "[--surface-raise:var(--color-surface-800)]");
});

test("borderVar publishes the per-level border slot, clamped", () => {
  assert.equal(borderVar(1), "[--surface-border:var(--surface-border-1)]");
  assert.equal(borderVar(5), "[--surface-border:var(--surface-border-5)]");
  assert.equal(borderVar(8), "[--surface-border:var(--surface-border-8)]");
  assert.equal(borderVar(12), "[--surface-border:var(--surface-border-8)]");
});
