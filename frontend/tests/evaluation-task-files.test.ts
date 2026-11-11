import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultFile, type FileNode, flattenFiles, trialFileTree } from "@/components/evaluation/task-files/utils";

const files = [
  "lmnr.yaml",
  "image/Dockerfile",
  "support/harbor.yaml",
  "support/agent/agent.py",
  "support/tasks/refund/task.toml",
  "support/tasks/refund/instruction.md",
  "support/tasks/refund/tests/test.sh",
  "support/tasks/charge/task.toml",
  "support/tasks/charge/instruction.md",
  "support/tasks/charge-notes.md",
  "billing/harbor.yaml",
  "shared/fetched/task.toml",
  "shared/fetched/run.sh",
].map((path) => ({ path, size: 1 }));

const paths = (nodes: FileNode[]) => flattenFiles(nodes).map((f) => f.path);

describe("trialFileTree", () => {
  it("roots the tree at the suite and keeps only the trial's task", () => {
    const tree = trialFileTree(files, "support", "support/tasks/refund");
    assert.equal(tree.root, "support");
    assert.equal(tree.taskDir, "tasks/refund");
    // Directories first, then files; the sibling task is gone, a file next to it isn't.
    assert.deepEqual(paths(tree.nodes), [
      "agent/agent.py",
      "tasks/refund/tests/test.sh",
      "tasks/refund/instruction.md",
      "tasks/refund/task.toml",
      "tasks/charge-notes.md",
      "harbor.yaml",
    ]);
  });

  it("shows a task outside its suite dir on its own", () => {
    const tree = trialFileTree(files, "support", "shared/fetched");
    assert.equal(tree.root, "shared/fetched");
    assert.equal(tree.taskDir, "");
    assert.deepEqual(paths(tree.nodes), ["run.sh", "task.toml"]);
  });
});

describe("defaultFile", () => {
  it("opens the task's instruction.md, not a suite file", () => {
    assert.equal(
      defaultFile(trialFileTree(files, "support", "support/tasks/refund"))?.path,
      "tasks/refund/instruction.md"
    );
  });

  it("falls back to the task's first file", () => {
    assert.equal(defaultFile(trialFileTree(files, "support", "shared/fetched"))?.path, "run.sh");
  });
});
