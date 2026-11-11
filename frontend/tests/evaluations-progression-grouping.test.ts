import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGrouping,
  describeMetadataKeys,
  flattenMetadata,
  MAX_GROUPS,
  NONE_GROUP,
} from "@/components/evaluations/progression-chart/grouping";

const run = (evaluationId: string, metadata: Record<string, unknown> | null) => ({
  evaluationId,
  timestamp: "2026-11-01 00:00:00",
  name: evaluationId,
  values: {},
  metadata,
});

describe("progression grouping", () => {
  it("flattens nested scalars to dot paths and skips arrays", () => {
    assert.deepEqual(flattenMetadata({ model: "a", cfg: { t: 0.2, tags: ["x"] }, n: null }), {
      model: "a",
      "cfg.t": 0.2,
    });
  });

  it("describes keys with their distinct value counts", () => {
    assert.deepEqual(describeMetadataKeys([run("1", { b: 1 }), run("2", { a: "x", b: 2 }), run("3", { b: 2 })]), [
      { key: "a", distinctValues: 1 },
      { key: "b", distinctValues: 2 },
    ]);
  });

  it("puts runs without the key into the none group, ordered last", () => {
    const g = buildGrouping([run("1", { model: "b" }), run("2", { model: "a" }), run("3", {})], "model");
    assert.deepEqual(
      g.groups.map((x) => x.label),
      ["a", "b", NONE_GROUP]
    );
    assert.equal(g.groupByEvalId["3"], NONE_GROUP);
  });

  it("keeps the largest groups and reports the rest as omitted", () => {
    const runs = Array.from({ length: MAX_GROUPS + 2 }, (_, i) => run(String(i), { id: i }));
    runs.push(run("dup", { id: 0 }));
    const g = buildGrouping(runs, "id");
    assert.equal(g.groups.length, MAX_GROUPS);
    assert.equal(g.omittedCount, 2);
    assert.ok(g.groups.some((x) => x.label === "0"));
  });
});
