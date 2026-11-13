import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sharedFilesOf } from "@/components/evaluation/task-files/utils";

const shared = (paths: string[], suitePath: string) =>
  sharedFilesOf(
    paths.map((path) => ({ path })),
    suitePath
  ).map((f) => f.path);

describe("sharedFilesOf", () => {
  it("keeps run-wide and suite-wide files, drops task dirs and other suites", () => {
    assert.deepEqual(
      shared(
        [
          "lmnr.yaml",
          "image/Dockerfile",
          "image/shared/start_stack.sh",
          "support/harbor.yaml",
          "support/agent/agent.py",
          "support/tasks/a/task.toml",
          "support/tasks/a/instruction.md",
          "support/tasks/a/environment/case.json",
          "billing/harbor.yaml",
          "billing/agent/agent.py",
        ],
        "support"
      ),
      ["lmnr.yaml", "image/Dockerfile", "image/shared/start_stack.sh", "support/harbor.yaml", "support/agent/agent.py"]
    );
  });

  it("drops task dirs wherever the suite keeps them", () => {
    assert.deepEqual(shared(["s/harbor.yaml", "s/cases/x/task.toml", "s/cases/x/tests/test.sh"], "s"), [
      "s/harbor.yaml",
    ]);
  });
});
