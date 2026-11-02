import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASE_ELEVATION,
  MAX_ELEVATION,
  MIN_ELEVATION,
  surfaceClasses,
  surfaceVars,
} from "@/components/ui/surface/classes";

test("surfaceClasses maps an elevation to its surface fill on the 50-step scale", () => {
  assert.equal(surfaceClasses(MIN_ELEVATION), "bg-surface-00");
  assert.equal(surfaceClasses(BASE_ELEVATION), "bg-surface-200");
  assert.equal(surfaceClasses(8), "bg-surface-400");
  assert.equal(surfaceClasses(MAX_ELEVATION), "bg-surface-1000");
});

test("surfaceClasses clamps out-of-range elevations onto the ladder", () => {
  assert.equal(surfaceClasses(0), "bg-surface-00");
  assert.equal(surfaceClasses(MAX_ELEVATION + 4), "bg-surface-1000");
});

test("surfaceVars on the base plane reaches down into the sunken wells", () => {
  assert.deepEqual(surfaceVars(BASE_ELEVATION), {
    "--color-surface": "var(--color-surface-200)",
    "--color-surface-up": "var(--color-surface-300)",
    "--color-surface-up-2": "var(--color-surface-350)",
    "--color-surface-up-3": "var(--color-surface-400)",
    "--color-surface-up-4": "var(--color-surface-450)",
    "--color-surface-up-5": "var(--color-surface-500)",
    "--color-surface-up-6": "var(--color-surface-550)",
    "--color-surface-up-7": "var(--color-surface-600)",
    "--color-surface-up-8": "var(--color-surface-650)",
    "--color-surface-down": "var(--color-surface-150)",
    "--color-surface-down-2": "var(--color-surface-100)",
    "--color-surface-down-3": "var(--color-surface-50)",
    "--color-surface-down-4": "var(--color-surface-00)",
    "--color-surface-down-5": "var(--color-surface-00)",
    "--color-surface-down-6": "var(--color-surface-00)",
    "--color-surface-down-7": "var(--color-surface-00)",
    "--color-surface-down-8": "var(--color-surface-00)",
    "--color-border": "var(--color-border-200)",
  });
});

test("surfaceVars clamps neighbours at the ends of the ladder", () => {
  assert.deepEqual(surfaceVars(MIN_ELEVATION), {
    "--color-surface": "var(--color-surface-00)",
    "--color-surface-up": "var(--color-surface-50)",
    "--color-surface-up-2": "var(--color-surface-100)",
    "--color-surface-up-3": "var(--color-surface-150)",
    "--color-surface-up-4": "var(--color-surface-200)",
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
    "--color-border": "var(--color-border-00)",
  });
  assert.deepEqual(surfaceVars(MAX_ELEVATION), {
    "--color-surface": "var(--color-surface-1000)",
    "--color-surface-up": "var(--color-surface-1000)",
    "--color-surface-up-2": "var(--color-surface-1000)",
    "--color-surface-up-3": "var(--color-surface-1000)",
    "--color-surface-up-4": "var(--color-surface-1000)",
    "--color-surface-up-5": "var(--color-surface-1000)",
    "--color-surface-up-6": "var(--color-surface-1000)",
    "--color-surface-up-7": "var(--color-surface-1000)",
    "--color-surface-up-8": "var(--color-surface-1000)",
    "--color-surface-down": "var(--color-surface-950)",
    "--color-surface-down-2": "var(--color-surface-900)",
    "--color-surface-down-3": "var(--color-surface-850)",
    "--color-surface-down-4": "var(--color-surface-800)",
    "--color-surface-down-5": "var(--color-surface-750)",
    "--color-surface-down-6": "var(--color-surface-700)",
    "--color-surface-down-7": "var(--color-surface-650)",
    "--color-surface-down-8": "var(--color-surface-600)",
    "--color-border": "var(--color-border-1000)",
  });
});

// A level with no scale token resolved to `var(--color-surface-NaN)`, which is invalid at
// computed-value time — so `border-color` fell back to currentColor and every border went white.
test("every level resolves to a real scale token, never NaN or undefined", () => {
  for (let elevation = MIN_ELEVATION - 2; elevation <= MAX_ELEVATION + 2; elevation++) {
    const values = Object.values(surfaceVars(elevation)) as string[];
    for (const value of values) {
      assert.match(
        value,
        /^var\(--color-(surface|border)-(00|50|[1-9]00|[1-9]50|1000)\)$/,
        `elevation ${elevation} → ${value}`
      );
    }
    assert.match(surfaceClasses(elevation), /^bg-surface-(00|50|[1-9]00|[1-9]50|1000)$/);
  }
});
