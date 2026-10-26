import assert from "node:assert/strict";
import { test } from "node:test";

import { ChartType } from "@/components/chart-builder/types";
import { resolveChartEditorMode } from "@/components/dashboards/editor/chart-editor-mode";
import { chartSavePayload } from "@/components/dashboards/editor/chart-save-payload";
import { getDefaultFormValues } from "@/components/dashboards/editor/utils";
import { type DashboardChart } from "@/components/dashboards/types";

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
  const structure = getDefaultFormValues();
  const result = await resolveChartEditorMode(chart, "project", async () => structure);
  assert.deepEqual(result, { mode: "visual", structure });
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
