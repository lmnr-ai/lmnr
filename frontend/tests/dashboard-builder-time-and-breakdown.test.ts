import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_BREAKDOWN, transformDataForBreakdown } from "@/components/chart-builder/charts/utils";
import { ChartType } from "@/components/chart-builder/types";
import { getTimeColumn } from "@/components/dashboards/editor/table-schemas";
import { getDefaultFormValues, toFormValues } from "@/components/dashboards/editor/utils";

test("reopening keeps a user's own time-column filter and strips only the dashboard bounds", () => {
  const filters = toFormValues(
    {
      ...getDefaultFormValues(),
      table: "signal_events",
      filters: [
        { field: "timestamp", op: "gte", stringValue: "2026-10-01 00:00:00" },
        { field: "timestamp", op: "gte", stringValue: "{start_time:DateTime64}" },
        { field: "timestamp", op: "lte", stringValue: "{end_time:DateTime64}" },
      ],
    },
    ChartType.Table
  ).filters;
  assert.deepEqual(filters, [{ field: "timestamp", op: "gte", stringValue: "2026-10-01 00:00:00" }]);
});

test("entity tables filter the dashboard range on created_at", () => {
  for (const table of ["signals", "evaluations", "datasets"]) assert.equal(getTimeColumn(table), "created_at");
});

test("empty breakdown values form their own series, fill rows do not", () => {
  const rows = [
    { time: "10:00", user_id: "", count: 4 },
    { time: "10:00", user_id: "alice", count: 2 },
    { time: "11:00", user_id: null, count: 1 },
    { time: "12:00", user_id: "", count: 0 },
  ];
  const { keys, chartData } = transformDataForBreakdown(rows, "time", "count", "user_id");
  assert.deepEqual([...keys].sort(), [EMPTY_BREAKDOWN, "alice"].sort());
  assert.equal(chartData.length, 3);
  assert.equal(chartData.find((row) => row.time === "11:00")?.[EMPTY_BREAKDOWN], 1);
});
