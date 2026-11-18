import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diffTasks, resolveTask } from "@/components/eval-datasets/utils";

const tasks = (entries: Record<string, string>) => Object.entries(entries).map(([name, hash]) => ({ name, hash }));

describe("diffTasks", () => {
  it("splits tasks into added, removed and changed by name and hash", () => {
    const v2 = tasks({
      "refund-partial": "sha256:b2",
      refund: "sha256:a1",
      "refund-new": "sha256:c1",
      Zeta: "sha256:z",
    });
    const v1 = tasks({ refund: "sha256:a1", "refund-partial": "sha256:b1", old: "sha256:o1", Zeta: "sha256:z" });
    assert.deepEqual(diffTasks(v2, v1), {
      added: ["refund-new"],
      removed: ["old"],
      changed: ["refund-partial"],
      unchanged: 2,
    });
  });

  it("is symmetric and empty for the same version", () => {
    const a = tasks({ x: "sha256:1" });
    const b = tasks({ y: "sha256:2" });
    assert.deepEqual(diffTasks(a, b), { added: ["x"], removed: ["y"], changed: [], unchanged: 0 });
    assert.deepEqual(diffTasks(b, a), { added: ["y"], removed: ["x"], changed: [], unchanged: 0 });
    assert.deepEqual(diffTasks(a, a), { added: [], removed: [], changed: [], unchanged: 1 });
  });

  it("sorts names in byte order, like the lockfile", () => {
    const diff = diffTasks(tasks({ b: "1", B: "1", "a-1": "1", a: "1" }), []);
    assert.deepEqual(diff.added, ["B", "a", "a-1", "b"]);
  });
});

describe("resolveTask", () => {
  it("finds the task at both versions", () => {
    const v2 = tasks({ x: "sha256:2", y: "sha256:y" });
    const v1 = tasks({ x: "sha256:1", z: "sha256:z" });
    assert.deepEqual(resolveTask("x", v2, v1), { hash: "sha256:2", baseHash: "sha256:1" });
    assert.deepEqual(resolveTask("z", v2, v1), { hash: null, baseHash: "sha256:z" });
    assert.deepEqual(resolveTask("y", v2, null), { hash: "sha256:y", baseHash: null });
    assert.deepEqual(resolveTask(null, v2, v1), { hash: null, baseHash: null });
  });
});
