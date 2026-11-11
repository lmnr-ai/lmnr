import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGrouping,
  describeMetadataKeys,
  flattenMetadata,
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
    // `a` is missing on two runs, so it splits into "x" and (none).
    assert.deepEqual(describeMetadataKeys([run("1", { b: 1 }), run("2", { a: "x", b: 2 }), run("3", { b: 2 })]), [
      { key: "a", distinctValues: 2 },
      { key: "b", distinctValues: 2 },
    ]);
    assert.deepEqual(describeMetadataKeys([run("1", { c: 1 }), run("2", { c: 1 })]), [{ key: "c", distinctValues: 1 }]);
  });

  it("puts runs without the key into the none group, ordered last", () => {
    const g = buildGrouping([run("1", { model: "b" }), run("2", { model: "a" }), run("3", {})], "model");
    assert.deepEqual(
      g.groups.map((x) => x.label),
      ["a", "b", NONE_GROUP]
    );
    assert.equal(g.groupByEvalId["3"], NONE_GROUP);
  });

  it("keeps every group, with no cap", () => {
    const runs = Array.from({ length: 25 }, (_, i) => run(String(i), { id: i }));
    const g = buildGrouping(runs, "id");
    assert.equal(g.groups.length, 25);
    assert.equal(new Set(g.groups.map((x) => x.color)).size > 1, true);
  });
});
