import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSampleRowsQuery, buildVerifyColumnQuery, SAMPLE_ROW_LIMIT } from "@/lib/actions/sql/column-sql-queries";

// Pure query construction for the agentic column-SQL generator (secondary
// seam). The agent iterates on `buildVerifyColumnQuery` against the same rows
// `buildSampleRowsQuery` returns; both run through the query-engine validator.

describe("buildSampleRowsQuery", () => {
  it("selects the sample columns from the table, scoped and limited", () => {
    const q = buildSampleRowsQuery({
      table: "evaluation_datapoints",
      sampleColumns: ["data", "target", "metadata"],
      whereSql: "evaluation_id = {evaluationId:UUID}",
    });
    assert.equal(
      q,
      `SELECT data, target, metadata FROM evaluation_datapoints WHERE evaluation_id = {evaluationId:UUID} LIMIT ${SAMPLE_ROW_LIMIT}`
    );
  });
});

describe("buildVerifyColumnQuery", () => {
  it("aliases the candidate expression and reuses the same scope + limit", () => {
    const q = buildVerifyColumnQuery({
      table: "evaluation_datapoints",
      expression: "simpleJSONExtractString(data, 'id')",
      whereSql: "evaluation_id = {evaluationId:UUID}",
    });
    assert.equal(
      q,
      `SELECT simpleJSONExtractString(data, 'id') AS value FROM evaluation_datapoints WHERE evaluation_id = {evaluationId:UUID} LIMIT ${SAMPLE_ROW_LIMIT}`
    );
  });
});
