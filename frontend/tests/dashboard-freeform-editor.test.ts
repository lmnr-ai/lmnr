import assert from "node:assert/strict";
import { test } from "node:test";

import { ChartType } from "@/components/chart-builder/types";
import { formKeepsStructure, resolveChartEditorMode } from "@/components/dashboards/editor/chart-editor-mode";
import { chartSavePayload } from "@/components/dashboards/editor/chart-save-payload";
import { getDefaultFormValues, getDefaultTimeRange } from "@/components/dashboards/editor/utils";
import { type DashboardChart } from "@/components/dashboards/types";
import { type QueryStructure } from "@/lib/actions/sql/types";

const chart: Pick<DashboardChart, "name" | "query" | "settings"> = {
  name: "Custom SQL",
  query: "SELECT count() AS n FROM spans",
  settings: {
    config: { type: ChartType.BarChart, x: "n", y: "n", displayMode: "none" },
    layout: { x: 1, y: 2, w: 4, h: 3 },
  },
};

test("unrepresentable saved SQL opens freeform without losing the query", async () => {
  const result = await resolveChartEditorMode(chart, "project", async () => {
    throw new Error("SQL conversion unsupported");
  });
  assert.deepEqual(result, { mode: "sql" });
  assert.equal(chart.query, "SELECT count() AS n FROM spans");
});

test("CTE stays freeform even when the best-effort reverse parser succeeds", async () => {
  const result = await resolveChartEditorMode(
    { ...chart, query: "WITH filtered AS (SELECT * FROM spans) SELECT count() AS n FROM filtered" },
    "project",
    async () => ({ ...getDefaultFormValues(), table: "filtered" })
  );
  assert.deepEqual(result, { mode: "sql" });
});

test("unknown tables and joins cannot open in the visual editor", async () => {
  const structure = getDefaultFormValues();
  assert.deepEqual(await resolveChartEditorMode(chart, "project", async () => ({ ...structure, table: "filtered" })), {
    mode: "sql",
  });
  assert.deepEqual(
    await resolveChartEditorMode(
      { ...chart, query: "SELECT count() FROM spans JOIN traces ON true" },
      "project",
      async () => structure
    ),
    { mode: "sql" }
  );
});

test("legacy SQL that converts still opens in the visual editor", async () => {
  const structure = { ...getDefaultFormValues(), timeRange: getDefaultTimeRange("spans") };
  const result = await resolveChartEditorMode(chart, "project", async () => structure);
  assert.deepEqual(result, { mode: "visual", structure });
});

test("a parsed query the visual form would rewrite opens freeform", async () => {
  // The parser is right about this query, but a bar chart's form adds a time bucket to it.
  const structure = { ...getDefaultFormValues(), dimensions: ["model"] };
  const result = await resolveChartEditorMode(chart, "project", async () => structure);
  assert.deepEqual(result, { mode: "sql" });
});

test("the visual form keeps only structures in its own shape for the chart type", () => {
  const bounds: QueryStructure["filters"] = [
    { field: "start_time", op: "gte", stringValue: "{start_time:DateTime64}" },
    { field: "start_time", op: "lte", stringValue: "{end_time:DateTime64}" },
  ];
  const llm: QueryStructure["filters"][number] = { field: "span_type", op: "eq", stringValue: "LLM" };
  const grouped = { ...getDefaultFormValues(), dimensions: ["model"], filters: bounds };
  const rows: QueryStructure = {
    ...grouped,
    dimensions: [],
    metrics: ["name", "trace_id", "span_id"].map((column) => ({ fn: "raw", column, alias: column, args: [] })),
  };
  const timeRange = getDefaultTimeRange("spans");

  const kept: [QueryStructure, ChartType][] = [
    [{ ...grouped, limit: 6 }, ChartType.HorizontalBarChart],
    // The form re-appends the time bounds last; AND order doesn't matter.
    [{ ...grouped, filters: [bounds[0], llm, bounds[1]] }, ChartType.HorizontalBarChart],
    [rows, ChartType.Table],
    [{ ...getDefaultFormValues(), dimensions: ["model"], timeRange }, ChartType.LineChart],
  ];
  for (const [structure, type] of kept) assert.ok(formKeepsStructure(structure, type), JSON.stringify(structure));

  const rewritten: [string, QueryStructure, ChartType][] = [
    ["a table drops LIMIT", { ...rows, limit: 6 }, ChartType.Table],
    ["a table drops the time bucket", { ...grouped, filters: [], timeRange }, ChartType.Table],
    ["a table gets hidden ID columns", { ...rows, metrics: rows.metrics.slice(0, 1) }, ChartType.Table],
    ["a horizontal bar gets time bounds", { ...grouped, filters: [llm] }, ChartType.HorizontalBarChart],
    ["a horizontal bar gets the upper bound", { ...grouped, filters: [bounds[0]] }, ChartType.HorizontalBarChart],
    ["a bar gets a time bucket", grouped, ChartType.BarChart],
    [
      "a line gets gap filling",
      { ...grouped, filters: [], timeRange: { ...timeRange, fillGaps: false } },
      ChartType.LineChart,
    ],
    [
      "a line moves to the table's time column",
      { ...grouped, filters: [], timeRange: { ...timeRange, column: "end_time" } },
      ChartType.LineChart,
    ],
  ];
  for (const [why, structure, type] of rewritten) assert.ok(!formKeepsStructure(structure, type), why);
});

test("stored visual structure bypasses reverse parsing", async () => {
  const structure = getDefaultFormValues();
  const result = await resolveChartEditorMode(
    { ...chart, settings: { ...chart.settings, queryStructure: structure } },
    "project",
    async () => {
      throw new Error("should not convert");
    }
  );
  assert.deepEqual(result, { mode: "visual", structure });
});

test("freeform save keeps raw SQL and chart settings without inventing a query structure", () => {
  const payload = chartSavePayload(chart, null);
  assert.equal(payload.query, chart.query);
  assert.equal(payload.config, chart.settings.config);
  assert.equal(payload.queryStructure, null);
});

test("visual save still persists the form structure", () => {
  const values = getDefaultFormValues();
  const payload = chartSavePayload(chart, values);
  assert.deepEqual(payload.queryStructure, values);
});
