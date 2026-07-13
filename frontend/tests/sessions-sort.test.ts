import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isRenderableActivity } from "@/components/traces/sessions-table/columns";
import { buildSessionsQueryWithParams, type SessionSortColumn } from "@/lib/actions/sessions/utils";

describe("buildSessionsQueryWithParams sort-key resolution", () => {
  const cases: Array<[SessionSortColumn, string]> = [
    ["start_time", "MIN(start_time)"],
    ["end_time", "MAX(end_time)"],
    ["duration", "SUM(end_time - start_time)"],
    ["total_tokens", "SUM(total_tokens)"],
    ["total_cost", "SUM(total_cost)"],
    ["trace_count", "COUNT(*)"],
  ];

  for (const [sortColumn, expr] of cases) {
    it(`resolves ${sortColumn} to ${expr}`, () => {
      const { query } = buildSessionsQueryWithParams({
        filters: [],
        sortColumn,
        sortDirection: "DESC",
      });
      assert.ok(query.includes(`ORDER BY ${expr} DESC`), `expected query to order by "${expr} DESC", got: ${query}`);
    });
  }

  it("resolves end_time with ASC direction", () => {
    const { query } = buildSessionsQueryWithParams({
      filters: [],
      sortColumn: "end_time",
      sortDirection: "ASC",
    });
    assert.ok(query.includes("ORDER BY MAX(end_time) ASC"), query);
  });
});

describe("buildSessionsQueryWithParams default ordering", () => {
  it("orders by MIN(start_time) DESC when no sortColumn is given", () => {
    const { query } = buildSessionsQueryWithParams({ filters: [] });
    assert.ok(query.includes("ORDER BY MIN(start_time) DESC"), query);
  });
});

describe("buildSessionsQueryWithParams pagination under sort", () => {
  it("keeps LIMIT and OFFSET alongside the ORDER BY when pagination options are set", () => {
    const { query, parameters } = buildSessionsQueryWithParams({
      filters: [],
      sortColumn: "end_time",
      sortDirection: "DESC",
      limit: 50,
      offset: 100,
    });

    assert.ok(query.includes("ORDER BY MAX(end_time) DESC"), query);
    assert.ok(query.includes("LIMIT {limit:UInt32} OFFSET {offset:UInt32}"), query);
    assert.equal(parameters.limit, 50);
    assert.equal(parameters.offset, 100);
  });
});

describe("isRenderableActivity", () => {
  it("returns true for a valid ISO timestamp", () => {
    assert.equal(isRenderableActivity("2026-07-13T10:00:00.000Z"), true);
  });

  it("returns false for epoch 0 (ingestion maps NULL Postgres times to epoch 0)", () => {
    assert.equal(isRenderableActivity("1970-01-01T00:00:00.000Z"), false);
  });

  it("returns false for absent values", () => {
    assert.equal(isRenderableActivity(null), false);
    assert.equal(isRenderableActivity(undefined), false);
    assert.equal(isRenderableActivity(""), false);
  });

  it("returns false for an invalid string", () => {
    assert.equal(isRenderableActivity("not-a-date"), false);
  });
});
