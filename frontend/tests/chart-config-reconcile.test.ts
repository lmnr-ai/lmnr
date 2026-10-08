import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ChartType } from "@/components/chart-builder/types";
import { type ColumnInfo, reconcileChartConfig } from "@/components/chart-builder/utils";

const columns: ColumnInfo[] = [
  { name: "day", type: "string" },
  { name: "count", type: "number" },
  { name: "model", type: "string" },
];

describe("reconcileChartConfig", () => {
  it("keeps a breakdown on a line chart", () => {
    const config = reconcileChartConfig(
      { type: ChartType.LineChart, x: "day", y: "count", breakdown: "model" },
      columns
    );
    assert.strictEqual(config.breakdown, "model");
  });

  it("drops a breakdown the bar controls cannot show", () => {
    const config = reconcileChartConfig(
      { type: ChartType.BarChart, x: "day", y: "count", breakdown: "model" },
      columns
    );
    assert.strictEqual(config.breakdown, undefined);
  });

  it("drops a breakdown on horizontal bars", () => {
    const config = reconcileChartConfig(
      { type: ChartType.HorizontalBarChart, x: "count", y: "day", breakdown: "model" },
      columns
    );
    assert.strictEqual(config.breakdown, undefined);
  });

  it("drops a breakdown naming a column the result set no longer returns", () => {
    const config = reconcileChartConfig(
      { type: ChartType.LineChart, x: "day", y: "count", breakdown: "provider" },
      columns
    );
    assert.strictEqual(config.breakdown, undefined);
  });

  it("drops a breakdown that duplicates an axis", () => {
    const config = reconcileChartConfig({ type: ChartType.LineChart, x: "day", y: "count", breakdown: "day" }, columns);
    assert.strictEqual(config.breakdown, undefined);
  });
});
