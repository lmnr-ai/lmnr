import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { flattenFiles } from "@/components/evaluation/task-files/utils";
import {
  buildTrialTree,
  datasetRootOf,
  defaultTrialFile,
  isFailedTrial,
  OUTPUT_ROOT,
  taskDirIn,
} from "@/components/evaluation/trial-files/utils";
import { datasetFilesOf } from "@/lib/evaluation/trial-files";

const entries = (...paths: string[]) => paths.map((path) => ({ path, size: 1 }));
const paths = (files: { path: string }[]) => files.map((f) => f.path);

describe("datasetFilesOf", () => {
  const archive = entries(
    "support/harbor.yaml",
    "support/agent/run.py",
    "support/tasks/refund/instruction.md",
    "support/tasks/refund/tests/test.sh",
    "support/tasks/refund-partial/instruction.md",
    "support/tasks.md",
    "billing/harbor.yaml",
    "billing/tasks/refund/instruction.md"
  );

  it("keeps the dataset dir and only the trial's task, relative to the dataset dir", () => {
    assert.deepEqual(paths(datasetFilesOf(archive, "support", "support/tasks/refund")), [
      "harbor.yaml",
      "agent/run.py",
      "tasks/refund/instruction.md",
      "tasks/refund/tests/test.sh",
      "tasks.md",
    ]);
  });

  it("keeps no task without a task path, and tolerates ./ and trailing slashes", () => {
    assert.deepEqual(paths(datasetFilesOf(archive, "./support/", null)), ["harbor.yaml", "agent/run.py", "tasks.md"]);
    assert.deepEqual(paths(datasetFilesOf(archive, "support", "support/tasks/refund-partial/")), [
      "harbor.yaml",
      "agent/run.py",
      "tasks/refund-partial/instruction.md",
      "tasks.md",
    ]);
  });

  it("reads a dataset at the archive root", () => {
    const root = entries("harbor.yaml", "tasks/a/instruction.md", "tasks/b/instruction.md");
    assert.deepEqual(paths(datasetFilesOf(root, ".", "tasks/b")), ["harbor.yaml", "tasks/b/instruction.md"]);
  });
});

describe("taskDirIn / datasetRootOf", () => {
  it("places the task inside the dataset dir", () => {
    assert.equal(taskDirIn("support", "support/tasks/refund"), "tasks/refund");
    assert.equal(taskDirIn("evals/support/", "evals/support/tasks/refund"), "tasks/refund");
    assert.equal(taskDirIn("support", "billing/tasks/refund"), null);
    assert.equal(taskDirIn("support", null), null);
    assert.equal(datasetRootOf("evals/support/"), "support");
    assert.equal(datasetRootOf(""), "dataset");
  });
});

describe("buildTrialTree", () => {
  it("puts the dataset dir and the trial output under two roots", () => {
    const tree = buildTrialTree(
      "support",
      entries("harbor.yaml", "tasks/refund/instruction.md"),
      entries("trial.log", "agent/oracle.txt")
    );
    assert.deepEqual(
      tree.map((n) => [n.name, n.path]),
      [
        ["support", "support"],
        [OUTPUT_ROOT, OUTPUT_ROOT],
      ]
    );
    assert.deepEqual(paths(flattenFiles(tree)), [
      "support/tasks/refund/instruction.md",
      "support/harbor.yaml",
      `${OUTPUT_ROOT}/agent/oracle.txt`,
      `${OUTPUT_ROOT}/trial.log`,
    ]);
  });

  it("leaves out a side that isn't available and keeps an empty one", () => {
    assert.deepEqual(
      buildTrialTree("support", entries("harbor.yaml"), null).map((n) => n.name),
      ["support"]
    );
    assert.deepEqual(buildTrialTree("support", null, []), [
      { name: OUTPUT_ROOT, path: OUTPUT_ROOT, size: 0, children: [] },
    ]);
  });
});

describe("defaultTrialFile", () => {
  const tree = (output: string[]) =>
    flattenFiles(
      buildTrialTree(
        "support",
        entries("harbor.yaml", "tasks/refund/instruction.md", "tasks/refund/task.toml"),
        entries(...output)
      )
    );
  const trial = ["agent/oracle.txt", "result.json", "trial.log", "verifier/test-stdout.txt"];
  const opts = { datasetRoot: "support", taskDir: "tasks/refund", failed: false };
  const open = (output: string[], options: Partial<typeof opts> & { preferred?: string | null } = {}) =>
    defaultTrialFile(tree(output), { ...opts, ...options })?.path;

  it("opens the task's instruction for a passed trial", () => {
    assert.equal(open(trial), "support/tasks/refund/instruction.md");
  });

  it("opens the most telling output for a failed trial", () => {
    const failed = { failed: true };
    assert.equal(open([...trial, "agent/run_case.log", "exception.txt"], failed), `${OUTPUT_ROOT}/agent/run_case.log`);
    assert.equal(open([...trial, "exception.txt"], failed), `${OUTPUT_ROOT}/agent/oracle.txt`);
    assert.equal(
      open(["exception.txt", "trial.log", "verifier/test-stdout.txt"], failed),
      `${OUTPUT_ROOT}/exception.txt`
    );
    assert.equal(open(["result.json", "trial.log"], failed), `${OUTPUT_ROOT}/trial.log`);
    // No output yet (or none of the known files): the instruction.
    assert.equal(open(["result.json"], failed), "support/tasks/refund/instruction.md");
  });

  it("keeps the file opened in another trial, mapping another task's file onto this one's", () => {
    assert.equal(
      open(trial, { preferred: `${OUTPUT_ROOT}/verifier/test-stdout.txt` }),
      `${OUTPUT_ROOT}/verifier/test-stdout.txt`
    );
    assert.equal(open(trial, { preferred: "support/tasks/other/task.toml" }), "support/tasks/refund/task.toml");
    assert.equal(
      open(trial, { preferred: `${OUTPUT_ROOT}/agent/run_case.log` }),
      "support/tasks/refund/instruction.md"
    );
  });

  it("falls back to the first file without a task", () => {
    const noTask = flattenFiles(buildTrialTree("support", entries("harbor.yaml"), entries(...trial)));
    assert.equal(defaultTrialFile(noTask, { ...opts, taskDir: null })?.path, "support/harbor.yaml");
    assert.equal(defaultTrialFile([], opts), null);
  });
});

describe("isFailedTrial", () => {
  const done = { topSpanId: "11111111-1111-1111-1111-111111111111" };

  it("fails errored trials and finished trials that scored 0", () => {
    assert.equal(isFailedTrial({ ...done, traceStatus: "error", scores: '{"reward":1}' }), true);
    assert.equal(isFailedTrial({ ...done, scores: '{"reward":0}' }), true);
    assert.equal(isFailedTrial({ ...done, scores: '{"reward":0,"other":1}' }), false);
    assert.equal(isFailedTrial({ ...done, scores: '{"reward":1}' }), false);
  });

  it("doesn't fail a trial that is still running", () => {
    assert.equal(isFailedTrial({ scores: "{}", "score:reward": 0 }), false);
    assert.equal(isFailedTrial(undefined), false);
  });
});
