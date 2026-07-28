import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeScoreRange, normalizeValue } from "@/components/evaluations/progression-chart/normalize";

describe("progression chart normalization", () => {
  describe("computeScoreRange", () => {
    it("fill-height mode (default): uses observed min/max even for 0–1 scores", () => {
      assert.deepEqual(computeScoreRange([0.8, 0.85, 0.9]), { min: 0.8, max: 0.9 });
    });

    it("pinUnitRange: a 0–1 score keeps a fixed 0–1 range", () => {
      assert.deepEqual(computeScoreRange([0.8, 0.85, 0.9], true), { min: 0, max: 1 });
    });

    it("pinUnitRange: a score outside 0–1 still uses its own min/max", () => {
      assert.deepEqual(computeScoreRange([120, 300, 90], true), { min: 90, max: 300 });
    });

    it("handles large-magnitude scores (durations, counts)", () => {
      assert.deepEqual(computeScoreRange([120, 300, 90]), { min: 90, max: 300 });
    });

    it("defaults to [0,1] when there are no values", () => {
      assert.deepEqual(computeScoreRange([]), { min: 0, max: 1 });
      assert.deepEqual(computeScoreRange([], true), { min: 0, max: 1 });
    });
  });

  describe("normalizeValue", () => {
    it("fills the full [0,1] height: min → 0, max → 1", () => {
      // The core 'fill full height always' guarantee.
      assert.equal(normalizeValue(0.8, 0.8, 0.9), 0);
      assert.equal(normalizeValue(0.9, 0.8, 0.9), 1);
    });

    it("places interior values proportionally", () => {
      assert.equal(normalizeValue(5, 0, 10), 0.5);
      assert.equal(normalizeValue(25, 0, 100), 0.25);
    });

    it("draws a constant score mid-chart", () => {
      assert.equal(normalizeValue(5, 5, 5), 0.5);
    });
  });
});
