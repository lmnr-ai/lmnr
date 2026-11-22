import assert from "node:assert/strict";
import { test } from "node:test";

import { numberVersions } from "@/components/eval-datasets/dataset/rows";

test("versions are numbered in push order, given newest first", () => {
  const versions = numberVersions([
    { hash: "c", pushedAt: "2026-03-01T00:00:00.000Z" },
    { hash: "b", pushedAt: "2026-02-01T00:00:00.000Z" },
    { hash: "a", pushedAt: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.deepEqual(
    versions.map((v) => [v.hash, v.number]),
    [
      ["c", 3],
      ["b", 2],
      ["a", 1],
    ]
  );
  assert.deepEqual(numberVersions([]), []);
});
