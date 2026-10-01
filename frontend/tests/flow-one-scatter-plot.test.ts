import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BENCHMARK_MODELS } from "@/components/landing/sections/flow-one/benchmark-data";
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  descF1ToY,
  tracesPerDollarToX,
} from "@/components/landing/sections/flow-one/chart-geometry";

describe("flow-1 comparison chart", () => {
  it("uses full-benchmark description F1 and under-100K pricing measurements", () => {
    assert.deepEqual(
      BENCHMARK_MODELS.map(({ descF1 }) => descF1),
      [74.1, 80.6, 76.9, 72.8, 63.8, 65.3]
    );
    assert.deepEqual(
      BENCHMARK_MODELS.map(({ tracesPerDollar }) => tracesPerDollar),
      [886, 7, 12, 38, 632, 14]
    );

    const flowOne = BENCHMARK_MODELS.find(({ label }) => label === "flow-1")!;
    const sol = BENCHMARK_MODELS.find(({ label }) => label === "GPT-6 Sol")!;
    assert.equal(Math.round(flowOne.tracesPerDollar / sol.tracesPerDollar), 23);
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
      const y = descF1ToY(model.descF1);

      assert.ok(x >= radius && x <= CHART_WIDTH - radius, `${model.label} x=${x} is clipped`);
      assert.ok(y >= radius && y <= CHART_HEIGHT - radius, `${model.label} y=${y} is clipped`);
    }
  });
});
