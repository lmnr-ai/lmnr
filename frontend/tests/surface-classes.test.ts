import assert from "node:assert/strict";
import { test } from "node:test";

import { surfaceClasses, surfaceVars } from "@/components/ui/surface/classes";

test("surfaceClasses maps an elevation (1..8) to its surface fill on the 50-step scale", () => {
  assert.equal(surfaceClasses(1), "bg-surface-00");
  assert.equal(surfaceClasses(3), "bg-surface-150");
  assert.equal(surfaceClasses(8), "bg-surface-400");
});

test("surfaceClasses clamps out-of-range elevations to 1..8", () => {
  assert.equal(surfaceClasses(0), "bg-surface-00");
  assert.equal(surfaceClasses(12), "bg-surface-400");
});

test("surfaceVars overrides the theme color vars + the elevation-relative border for a level", () => {
  assert.deepEqual(surfaceVars(4), {
    "--color-surface": "var(--color-surface-200)",
    "--color-surface-up": "var(--color-surface-250)",
    "--color-surface-up-2": "var(--color-surface-300)",
    "--color-surface-up-3": "var(--color-surface-350)",
    "--color-surface-down": "var(--color-surface-150)",
    "--color-surface-down-2": "var(--color-surface-100)",
    "--color-surface-down-3": "var(--color-surface-00)",
    "--color-border": "var(--color-surface-500)", // 200 + 300 offset
  });
});

test("surfaceVars clamps neighbours + border at the ends of the ramp", () => {
  // Base plane: down-steps clamp at surface-00; border = 0 + 300 = surface-300.
  assert.deepEqual(surfaceVars(1), {
    "--color-surface": "var(--color-surface-00)",
    "--color-surface-up": "var(--color-surface-100)",
    "--color-surface-up-2": "var(--color-surface-150)",
    "--color-surface-up-3": "var(--color-surface-200)",
    "--color-surface-down": "var(--color-surface-00)",
    "--color-surface-down-2": "var(--color-surface-00)",
    "--color-surface-down-3": "var(--color-surface-00)",
    "--color-border": "var(--color-surface-300)",
  });
  // Top elevation: up-steps clamp at surface-400; border = 400 + 300 = surface-700.
  assert.deepEqual(surfaceVars(8), {
    "--color-surface": "var(--color-surface-400)",
    "--color-surface-up": "var(--color-surface-400)",
    "--color-surface-up-2": "var(--color-surface-400)",
    "--color-surface-up-3": "var(--color-surface-400)",
    "--color-surface-down": "var(--color-surface-350)",
    "--color-surface-down-2": "var(--color-surface-300)",
    "--color-surface-down-3": "var(--color-surface-250)",
    "--color-border": "var(--color-surface-700)",
  });
});
