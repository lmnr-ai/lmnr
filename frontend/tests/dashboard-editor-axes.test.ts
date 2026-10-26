import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ChartType } from "@/components/chart-builder/types";
import { savedHorizontalBarAxes } from "@/components/dashboards/editor/utils";

// What `SELECT id AS trace_id, total_cost AS cost FROM traces …` reverse-parses to.
const rawMetrics = [
  { column: "id", alias: "trace_id" },
  { column: "total_cost", alias: "cost" },
];

describe("savedHorizontalBarAxes", () => {
  it("keeps saved axes over raw columns with no dimension", () => {
    const axes = savedHorizontalBarAxes(
      { type: ChartType.HorizontalBarChart, x: "cost", y: "trace_id" },
      rawMetrics,
      []
    );
    assert.deepStrictEqual(axes, { x: "cost", y: "trace_id" });
  });

  it("keeps a saved category that is a dimension", () => {
    const axes = savedHorizontalBarAxes(
      { type: ChartType.HorizontalBarChart, x: "count", y: "model" },
      [{ column: "*", alias: "count" }],
      ["model"]
    );
    assert.deepStrictEqual(axes, { x: "count", y: "model" });
  });

  it("falls back once the form no longer selects a saved axis", () => {
    const axes = savedHorizontalBarAxes(
      { type: ChartType.HorizontalBarChart, x: "cost", y: "trace_id" },
      [{ column: "total_cost", alias: "cost" }],
      []
    );
    assert.strictEqual(axes, null);
  });

  it("ignores axes carried over from a line chart", () => {
    const axes = savedHorizontalBarAxes(
      { type: ChartType.HorizontalBarChart, x: "time", y: "count" },
      [{ column: "*", alias: "count" }],
      []
    );
    assert.strictEqual(axes, null);
  });

  it("only applies to horizontal bars", () => {
    const axes = savedHorizontalBarAxes({ type: ChartType.BarChart, x: "cost", y: "trace_id" }, rawMetrics, []);
    assert.strictEqual(axes, null);
  });
});
