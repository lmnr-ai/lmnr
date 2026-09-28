import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BENCHMARK_MODELS } from "@/components/landing/sections/flow-one/benchmark-data";
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  f1ScoreToY,
  tracesPerDollarToX,
} from "@/components/landing/sections/flow-one/chart-geometry";

describe("Flow-1 comparison chart", () => {
  it("uses full-benchmark F1 and median cost measurements", () => {
    assert.deepEqual(
      BENCHMARK_MODELS.map(({ f1Score }) => f1Score),
      [83.5, 89, 83.5, 81.6, 79.5, 69.9]
    );
    assert.deepEqual(
      BENCHMARK_MODELS.map(({ tracesPerDollar }) => tracesPerDollar),
      [250, 3, 5.7, 12.7, 222.2, 10.6]
    );
  });

  it("spaces equal traces-per-dollar intervals equally", () => {
    const firstInterval = tracesPerDollarToX(100) - tracesPerDollarToX(50);
    const secondInterval = tracesPerDollarToX(150) - tracesPerDollarToX(100);

    assert.ok(Math.abs(firstInterval - secondInterval) < 1e-12);
  });

  it("keeps every model point inside the plot", () => {
    for (const model of BENCHMARK_MODELS) {
      const radius = model.flow ? 4 : 2;
      const x = tracesPerDollarToX(model.tracesPerDollar);
      const y = f1ScoreToY(model.f1Score);

      assert.ok(x >= radius && x <= CHART_WIDTH - radius, `${model.label} x=${x} is clipped`);
      assert.ok(y >= radius && y <= CHART_HEIGHT - radius, `${model.label} y=${y} is clipped`);
    }
  });
});
