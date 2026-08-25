import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvalQuery, stripTruncatedAliases } from "@/lib/actions/evaluation/query-builder";

// Regression: a truncated preview column (substring(data,1,200) AS data) must NOT
// shadow the raw `data` column that a custom column extracts from. It's aliased to
// `truncated:data` in SQL and renamed back in the response.
const baseOpts = {
  evaluationId: "11111111-1111-1111-1111-111111111111",
  traceIds: [],
  filters: [],
  limit: 50,
  offset: 0,
};

describe("truncated-alias shadowing fix", () => {
  it("aliases a truncated preview column to truncated:<id>, leaving the custom expr's raw ref bare", () => {
    const { query } = buildEvalQuery({
      ...baseOpts,
      columns: [
        { id: "data", sql: "substring(data, 1, 200)", truncated: true },
        { id: "custom:Label", sql: "simpleJSONExtractString(data, 'name')" },
      ],
    });
    // Preview aliased away from the raw name...
    assert.match(query, /substring\(data, 1, 200\) as `truncated:data`/);
    assert.doesNotMatch(query, /substring\(data, 1, 200\) as `data`/);
    // ...so the custom column's `data` binds to the raw column, not the truncated alias.
    assert.match(query, /simpleJSONExtractString\(data, 'name'\) as `custom:Label`/);
  });

  it("does not alias non-truncated columns", () => {
    const { query } = buildEvalQuery({
      ...baseOpts,
      columns: [{ id: "custom:Label", sql: "simpleJSONExtractString(data, 'name')" }],
    });
    assert.doesNotMatch(query, /truncated:/);
  });

  it("references the safe alias in comparison mode", () => {
    const { query } = buildEvalQuery({
      ...baseOpts,
      targetId: "22222222-2222-2222-2222-222222222222",
      columns: [
        { id: "data", sql: "substring(data, 1, 200)", truncated: true },
        { id: "index", sql: "`index`" },
      ],
    });
    assert.match(query, /p\.`truncated:data`/);
  });
});

describe("stripTruncatedAliases", () => {
  it("renames truncated:<id> keys back to <id>", () => {
    const out = stripTruncatedAliases([{ "truncated:data": "full value", "custom:Label": "x", index: 0 }]);
    assert.deepEqual(out[0], { data: "full value", "custom:Label": "x", index: 0 });
  });

  it("leaves rows without prefixed keys untouched (same reference)", () => {
    const rows = [{ id: "a", index: 1 }];
    assert.equal(stripTruncatedAliases(rows)[0], rows[0]);
  });
});
