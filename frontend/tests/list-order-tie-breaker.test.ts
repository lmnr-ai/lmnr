import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSpansQueryWithParams } from "@/lib/actions/spans/utils";
import { buildTracesQueryWithParams } from "@/lib/actions/traces/utils";

const PROJECT_ID = "0190c3a4-0000-7000-8000-000000000001";

describe("list ordering tie-breakers", () => {
  const traces = {
    projectId: PROJECT_ID,
    traceType: "DEFAULT" as const,
    traceIds: [],
    filters: [],
    limit: 50,
    offset: 50,
    pastHours: "24",
  };

  it("orders traces by start_time then id", () => {
    const { query } = buildTracesQueryWithParams(traces);
    assert.match(query, /ORDER BY start_time DESC, id ASC LIMIT/);
  });

  it("keeps the id tie-breaker under a custom sort column", () => {
    const { query } = buildTracesQueryWithParams({
      ...traces,
      sortBy: "total_cost",
      sortSql: "total_cost",
      sortDirection: "ASC",
    });
    assert.match(query, /ORDER BY total_cost ASC, id ASC LIMIT/);
  });

  it("orders spans by start_time then span_id by default", () => {
    const { query } = buildSpansQueryWithParams({
      projectId: PROJECT_ID,
      filters: [],
      limit: 50,
      offset: 50,
      pastHours: "24",
    });
    assert.match(query, /ORDER BY start_time DESC, span_id ASC LIMIT/);
  });
});
