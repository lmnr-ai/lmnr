import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getHeatmapColor } from "@/components/evaluation/utils";

// The gradient maps the range's low end -> red and high end -> green when
// higher-is-better; inverting the flag must swap which end is "good".
describe("getHeatmapColor direction inversion", () => {
  const range = { min: 0, max: 10 };

  it("higher-is-better: min value is red, max value is green", () => {
    assert.equal(getHeatmapColor(0, range, true), "rgb(204, 51, 51)");
    assert.equal(getHeatmapColor(10, range, true), "rgb(34, 197, 94)");
  });

  it("lower-is-better: the gradient flips (min value is green, max value is red)", () => {
    assert.equal(getHeatmapColor(0, range, false), "rgb(34, 197, 94)");
    assert.equal(getHeatmapColor(10, range, false), "rgb(204, 51, 51)");
  });

  it("defaults to higher-is-better when the flag is omitted", () => {
    assert.equal(getHeatmapColor(0, range), getHeatmapColor(0, range, true));
  });

  it("is symmetric: color(v, higher) equals color(mirrored v, lower)", () => {
    // normalize(3) = 0.3; for lower-is-better, value 7 maps to 1 - 0.7 = 0.3.
    assert.equal(getHeatmapColor(3, range, true), getHeatmapColor(7, range, false));
  });

  it("returns null for a degenerate (zero-width) range", () => {
    assert.equal(getHeatmapColor(5, { min: 5, max: 5 }, false), null);
  });
});
