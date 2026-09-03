import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Filter } from "@/lib/actions/common/filters";
import { JSON_OPERATORS, Operator } from "@/lib/actions/common/operators";
import { buildWhereClause } from "@/lib/actions/common/query-builder";
import { tracesColumnFilterConfig } from "@/lib/actions/traces/utils";

const metadataFilter = (operator: Operator, value: string): Filter =>
  ({ column: "metadata", operator, value, dataType: "json" }) as Filter;

const whereFor = (operator: Operator, value: string) =>
  buildWhereClause({ filters: [metadataFilter(operator, value)], columnFilterConfig: tracesColumnFilterConfig });

describe("metadata (json) filter operators", () => {
  it("exposes both = and != to the UI", () => {
    assert.deepEqual([...JSON_OPERATORS], [Operator.Eq, Operator.Ne]);
  });

  it("matches the decoded string or the raw JSON encoding for =", () => {
    const { query, parameters } = whereFor(Operator.Eq, "env=prod");
    assert.ok(query.includes("simpleJSONExtractString(metadata"));
    assert.ok(query.includes("simpleJSONExtractRaw(metadata"));
    assert.ok(!query.includes("NOT ("));
    assert.deepEqual(Object.values(parameters), ["env", "prod"]);
  });

  it("negates the whole match for != so rows without the key are kept", () => {
    const { query, parameters } = whereFor(Operator.Ne, "env=prod");
    assert.ok(query.includes("NOT ("), `expected a negated match, got: ${query}`);
    assert.deepEqual(Object.values(parameters), ["env", "prod"]);
  });

  it("keeps the key and value as bound parameters, never inlined", () => {
    const { query, parameters } = whereFor(Operator.Ne, "env='; DROP TABLE traces --");
    assert.ok(!query.includes("DROP TABLE"));
    assert.deepEqual(parameters, {
      metadata_0_key: "env",
      metadata_0_val: "'; DROP TABLE traces --",
    });
  });

  it("drops a filter that has no `key=value` shape", () => {
    assert.equal(whereFor(Operator.Ne, "env").query, "");
  });
});
