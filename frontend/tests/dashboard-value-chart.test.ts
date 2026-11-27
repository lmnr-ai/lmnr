import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatSingleValue } from "@/components/chart-builder/charts/format-value";
import { ChartType } from "@/components/chart-builder/types";
import { getDefaultFormValues, transformFormForChartType } from "@/components/dashboards/editor/utils";

describe("formatSingleValue", () => {
  it("formats numbers by the column's unit", () => {
    assert.deepEqual(formatSingleValue(1234, "count"), { kind: "number", text: (1234).toLocaleString() });
    assert.equal(formatSingleValue(3.5, "total_cost").text, "$3.50");
    assert.equal(
      formatSingleValue(2_500_000, "count").text,
      (2_500_000).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 })
    );
    // Units keep full precision even past the compact threshold.
    assert.equal(formatSingleValue(2_500_000, "total_cost").text, "$2,500,000.00");
  });

  it("shows text, booleans and JSON as written", () => {
    assert.deepEqual(formatSingleValue("gpt-4o", "model"), { kind: "text", text: "gpt-4o" });
    assert.deepEqual(formatSingleValue("12345", "id"), { kind: "text", text: "12345" });
    assert.equal(formatSingleValue(true, "ok").text, "true");
    assert.equal(formatSingleValue(["a", "b"], "tags").text, '["a","b"]');
  });

  it("reads null, empty and non-finite values as empty", () => {
    for (const value of [null, undefined, "", NaN, Infinity]) {
      assert.equal(formatSingleValue(value, "n").kind, "empty");
    }
  });
});

describe("transformFormForChartType to Value", () => {
  it("drops group by, order and limit but keeps the metric and filters", () => {
    const form = {
      ...getDefaultFormValues(),
      metrics: [{ fn: "raw" as const, column: "argMax(model, start_time)", alias: "latest", args: [] }],
      dimensions: ["model"],
      filters: [{ field: "status", op: "eq" as const, stringValue: "ERROR" }],
      orderBy: [{ field: "latest", dir: "desc" as const }],
      limit: 10,
    };
    const next = transformFormForChartType(form, ChartType.Value, ChartType.HorizontalBarChart);
    assert.deepEqual(next.metrics, form.metrics);
    assert.deepEqual(next.filters, form.filters);
    assert.deepEqual(next.dimensions, []);
    assert.deepEqual(next.orderBy, []);
    assert.equal(next.limit, undefined);
  });

  it("replaces a table's bare columns with an aggregate", () => {
    const form = {
      ...getDefaultFormValues(),
      metrics: [{ fn: "raw" as const, column: "name", alias: "name", args: [] }],
    };
    const next = transformFormForChartType(form, ChartType.Value, ChartType.Table);
    assert.deepEqual(next.metrics, [{ fn: "count", column: "*", alias: "count", args: [] }]);
  });
});
