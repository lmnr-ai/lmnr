import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvalTrialsQuery } from "@/lib/actions/evaluation/query-builder";
import { EVAL_COLUMN_SQL, resolveEvalColumns } from "@/lib/evaluation/columns";

describe("resolveEvalColumns", () => {
  it("takes SQL from the registry, never from the request", () => {
    const columns = resolveEvalColumns(["taskId", "metadata"], []);
    assert.deepEqual(columns, [
      { id: "taskId", ...EVAL_COLUMN_SQL.taskId },
      { id: "metadata", ...EVAL_COLUMN_SQL.metadata },
    ]);
  });

  it("drops custom, unknown, and prototype ids", () => {
    assert.deepEqual(resolveEvalColumns(["custom:leak", "nope", "constructor", "__proto__"], []), []);
  });

  it("keeps only score columns the evaluation has", () => {
    const injected = "score:x'), (SELECT groupArray(input) FROM spans) AS y, ('";
    const columns = resolveEvalColumns(["score:acc", injected, "score:missing"], ["acc"]);
    assert.deepEqual(
      columns.map((c) => c.id),
      ["score:acc"]
    );
    assert.equal(columns[0].sql, "simpleJSONExtractFloat(scores, 'acc')");
  });

  it("escapes quotes in real score names", () => {
    const [column] = resolveEvalColumns(["score:it's"], ["it's"]);
    assert.equal(column.sql, "simpleJSONExtractFloat(scores, 'it\\'s')");
  });

  it("builds a trials query with no subquery from the request", () => {
    const columns = resolveEvalColumns(["taskId", "data"], []);
    const { query } = buildEvalTrialsQuery({
      evaluationId: "00000000-0000-0000-0000-000000000000",
      columns,
      traceIds: [],
      filters: [],
      taskIds: ["t0"],
    });
    assert.ok(!query.includes("SELECT groupArray"));
    assert.ok(query.includes("substring(data, 1, 200) as __c1"));
  });
});
