import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkAxes,
  checkBreakdown,
  checkCharts,
  checkMappings,
  checkParameters,
  type RawChartConfig,
  type RunQuery,
  testParameters,
} from "@/lib/actions/dashboard/chart-query";
import { DashboardError } from "@/lib/actions/dashboard/errors";
import { ApiError } from "@/lib/api/errors";

const config = (type: RawChartConfig["type"], x?: string, y?: string): RawChartConfig => ({ type, x, y });

const TIME_SERIES =
  "SELECT toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time, count() AS n " +
  "FROM spans WHERE start_time >= {start_time:DateTime64} AND start_time <= {end_time:DateTime64} GROUP BY time";

describe("checkParameters", () => {
  it("accepts the dashboard parameters", () => {
    assert.equal(checkParameters(TIME_SERIES, config("line", "time", "n")), undefined);
    const spaced =
      "SELECT count() AS n FROM spans WHERE start_time >= { start_time : DateTime64 } AND start_time <= {end_time:DateTime64}";
    assert.equal(checkParameters(spaced, config("table")), undefined);
  });

  it("requires both time bounds", () => {
    const q = "SELECT count() AS n FROM spans WHERE start_time >= {start_time:DateTime64}";
    assert.match(checkParameters(q, config("table")) ?? "", /end_time/);
    const fixed = "SELECT count() AS n FROM spans WHERE start_time > now() - INTERVAL 1 DAY";
    assert.ok(checkParameters(fixed, config("table")));
  });

  it("rejects wrong types and unknown parameters", () => {
    const wrongType =
      "SELECT 1 FROM spans WHERE start_time >= {start_time:DateTime} AND start_time <= {end_time:DateTime64}";
    assert.match(checkParameters(wrongType, config("table")) ?? "", /\{start_time:DateTime64\}/);
    const unknown =
      "SELECT 1 FROM spans WHERE start_time >= {start_time:DateTime64} AND start_time <= {end_time:DateTime64} AND name = {span:String}";
    assert.ok(checkParameters(unknown, config("table")));
  });

  it("requires interval bucketing for a time series only", () => {
    const q =
      "SELECT toStartOfHour(start_time) AS time, count() AS n FROM spans " +
      "WHERE start_time >= {start_time:DateTime64} AND start_time <= {end_time:DateTime64} GROUP BY time";
    assert.match(checkParameters(q, config("line", "time", "n")) ?? "", /interval_unit/);
    assert.equal(checkParameters(q, config("bar", "model", "n")), undefined);
  });
});

it("testParameters match the frontend format", () => {
  assert.deepEqual(testParameters(new Date("2026-10-22T12:30:45.123Z")), {
    start_time: "2026-10-21 12:30:45.123",
    end_time: "2026-10-22 12:30:45.123",
    interval_unit: "HOUR",
  });
});

it("checkMappings names the result columns", () => {
  const columns = new Set(["time", "n"]);
  assert.equal(checkMappings(config("line", "time", "n"), columns), undefined);
  assert.match(checkMappings(config("line", "time", "count"), columns) ?? "", /returns only: n, time/);
  assert.equal(checkMappings(config("table"), columns), undefined);
});

it("checkAxes requires x and y except for tables", () => {
  assert.equal(checkAxes(config("line", "time", "n")), undefined);
  assert.ok(checkAxes(config("line", "time")));
  assert.ok(checkAxes(config("horizontalBar", undefined, "name")));
  assert.equal(checkAxes(config("table")), undefined);
  assert.equal(checkAxes(config("value")), undefined);
});

it("checkBreakdown flags grouped rows without a breakdown", () => {
  const rows = [
    { time: "10:00", status: "success", n: 12 },
    { time: "10:00", status: "error", n: 3 },
  ];
  const line = config("line", "time", "n");
  assert.match(checkBreakdown(line, rows) ?? "", /candidates: status/);
  assert.equal(checkBreakdown({ ...line, breakdown: "status" }, rows), undefined);
  assert.equal(checkBreakdown(line, rows.slice(0, 1)), undefined);
  assert.equal(checkBreakdown(config("horizontalBar", "n", "status"), rows), undefined);
});

describe("checkCharts", () => {
  const rows =
    (result: Record<string, unknown>[]): RunQuery =>
    async () =>
      result;

  it("strips a trailing semicolon and passes name/layout-only patches through", async () => {
    const id = "6ae844c3-6088-42d3-8811-cf5476a41b1a";
    const { upserts, warnings } = await checkCharts(
      [
        { name: "Spans", query: `${TIME_SERIES};\n`, config: config("line", "time", "n") },
        { id, name: "Renamed" },
      ],
      rows([{ time: "10:00", n: 1 }])
    );
    assert.equal(upserts[0].query, TIME_SERIES);
    assert.deepEqual(upserts[1], { id, name: "Renamed" });
    assert.deepEqual(warnings, []);
  });

  it("warns when there are no rows to check against", async () => {
    const { warnings } = await checkCharts(
      [{ name: "Spans", query: TIME_SERIES, config: config("line", "time", "n") }],
      rows([])
    );
    assert.match(warnings[0], /^charts\[0\]: the query returned no rows/);
  });

  it("rejects the batch on a failing query with the SQL error message", async () => {
    const failing: RunQuery = async () => {
      throw new ApiError("Query validation failed: unknown table", 400);
    };
    await assert.rejects(
      checkCharts([{ name: "Spans", query: TIME_SERIES, config: config("line", "time", "n") }], failing),
      (e: unknown) =>
        e instanceof DashboardError &&
        e.status === 400 &&
        e.message === "charts[0]: query failed when run over the last 24h: Query validation failed: unknown table"
    );
  });

  it("warns when a value chart returns more than one row", async () => {
    const query =
      "SELECT model, count() AS n FROM spans WHERE start_time >= {start_time:DateTime64} AND start_time <= {end_time:DateTime64} GROUP BY model";
    const twoRows = rows([
      { model: "a", n: 1 },
      { model: "b", n: 2 },
    ]);
    const { upserts, warnings } = await checkCharts(
      [{ name: "Models", query, config: config("value", undefined, "n") }],
      twoRows
    );
    assert.equal(upserts[0].query, query);
    assert.match(warnings[0], /^charts\[0\]: a value chart shows only the first row/);
    await assert.rejects(
      checkCharts([{ name: "Models", query, config: config("value", undefined, "missing") }], twoRows),
      /returns only: model, n/
    );
  });

  it("requires query and config together", async () => {
    await assert.rejects(checkCharts([{ name: "Spans", query: TIME_SERIES }], rows([])), /given together/);
  });

  it("caps the batch size", async () => {
    const charts = Array.from({ length: 31 }, () => ({ name: "x" }));
    await assert.rejects(checkCharts(charts, rows([])), /At most 30 charts/);
  });
});
