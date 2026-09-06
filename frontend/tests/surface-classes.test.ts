import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_ELEVATION, MIN_ELEVATION, surfaceClasses, surfaceVars } from "@/components/ui/surface/classes";

test("surfaceClasses maps an elevation to its surface fill on the 50-step scale", () => {
  assert.equal(surfaceClasses(1), "bg-surface-00");
  assert.equal(surfaceClasses(3), "bg-surface-150");
  assert.equal(surfaceClasses(8), "bg-surface-400");
  assert.equal(surfaceClasses(MAX_ELEVATION), "bg-surface-800");
});

test("surfaceClasses clamps out-of-range elevations onto the ladder", () => {
  assert.equal(surfaceClasses(0), "bg-surface-00");
  assert.equal(surfaceClasses(MAX_ELEVATION + 4), "bg-surface-800");
});

test("surfaceVars overrides the theme color vars + the elevation-relative border for a level", () => {
  assert.deepEqual(surfaceVars(4), {
    "--color-surface": "var(--color-surface-200)",
    "--color-surface-up": "var(--color-surface-250)",
    "--color-surface-up-2": "var(--color-surface-300)",
    "--color-surface-up-3": "var(--color-surface-350)",
    "--color-surface-up-4": "var(--color-surface-400)",
    "--color-surface-up-5": "var(--color-surface-450)",
    "--color-surface-up-6": "var(--color-surface-500)",
    "--color-surface-up-7": "var(--color-surface-550)",
    "--color-surface-up-8": "var(--color-surface-600)",
    "--color-surface-down": "var(--color-surface-150)",
    "--color-surface-down-2": "var(--color-surface-100)",
    "--color-surface-down-3": "var(--color-surface-00)",
    "--color-surface-down-4": "var(--color-surface-00)",
    "--color-surface-down-5": "var(--color-surface-00)",
    "--color-surface-down-6": "var(--color-surface-00)",
    "--color-surface-down-7": "var(--color-surface-00)",
    "--color-surface-down-8": "var(--color-surface-00)",
    "--color-border": "var(--color-surface-450)", // 5 levels up from 4
  });
});

test("surfaceVars clamps neighbours + border at the ends of the ladder", () => {
  // Base plane: every down-step clamps at surface-00; border = level 6.
  assert.deepEqual(surfaceVars(MIN_ELEVATION), {
    "--color-surface": "var(--color-surface-00)",
    "--color-surface-up": "var(--color-surface-100)",
    "--color-surface-up-2": "var(--color-surface-150)",
    "--color-surface-up-3": "var(--color-surface-200)",
    "--color-surface-up-4": "var(--color-surface-250)",
    "--color-surface-up-5": "var(--color-surface-300)",
    "--color-surface-up-6": "var(--color-surface-350)",
    "--color-surface-up-7": "var(--color-surface-400)",
    "--color-surface-up-8": "var(--color-surface-450)",
    "--color-surface-down": "var(--color-surface-00)",
    "--color-surface-down-2": "var(--color-surface-00)",
    "--color-surface-down-3": "var(--color-surface-00)",
    "--color-surface-down-4": "var(--color-surface-00)",
    "--color-surface-down-5": "var(--color-surface-00)",
    "--color-surface-down-6": "var(--color-surface-00)",
    "--color-surface-down-7": "var(--color-surface-00)",
    "--color-surface-down-8": "var(--color-surface-00)",
    "--color-border": "var(--color-surface-300)",
  });
  // Top: every up-step and the border clamp at surface-800.
  assert.deepEqual(surfaceVars(MAX_ELEVATION), {
    "--color-surface": "var(--color-surface-800)",
    "--color-surface-up": "var(--color-surface-800)",
    "--color-surface-up-2": "var(--color-surface-800)",
    "--color-surface-up-3": "var(--color-surface-800)",
    "--color-surface-up-4": "var(--color-surface-800)",
    "--color-surface-up-5": "var(--color-surface-800)",
    "--color-surface-up-6": "var(--color-surface-800)",
    "--color-surface-up-7": "var(--color-surface-800)",
    "--color-surface-up-8": "var(--color-surface-800)",
    "--color-surface-down": "var(--color-surface-750)",
    "--color-surface-down-2": "var(--color-surface-700)",
    "--color-surface-down-3": "var(--color-surface-650)",
    "--color-surface-down-4": "var(--color-surface-600)",
    "--color-surface-down-5": "var(--color-surface-550)",
    "--color-surface-down-6": "var(--color-surface-500)",
    "--color-surface-down-7": "var(--color-surface-450)",
    "--color-surface-down-8": "var(--color-surface-400)",
    "--color-border": "var(--color-surface-800)",
  });
});

// A level with no scale token resolved to `var(--color-surface-NaN)`, which is invalid at
// computed-value time — so `border-color` fell back to currentColor and every border went white.
test("every level resolves to a real scale token, never NaN or undefined", () => {
  for (let elevation = MIN_ELEVATION - 2; elevation <= MAX_ELEVATION + 2; elevation++) {
    const values = Object.values(surfaceVars(elevation)) as string[];
    for (const value of values) {
      assert.match(value, /^var\(--color-surface-(00|50|[1-8]00|[1-7]50)\)$/, `elevation ${elevation} → ${value}`);
    }
    assert.match(surfaceClasses(elevation), /^bg-surface-(00|50|[1-8]00|[1-7]50)$/);
  }
});
