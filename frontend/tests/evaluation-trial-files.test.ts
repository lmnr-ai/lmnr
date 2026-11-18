import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { flattenFiles, taskVersionHashOf } from "@/components/evaluation/task-files/utils";
import {
  buildTrialTree,
  defaultTrialFile,
  isFailedTrial,
  splitTreePath,
  trialFilesUrls,
} from "@/components/evaluation/trial-files/utils";
import { isDatasetName, isTaskHash, isTaskName } from "@/lib/actions/eval-datasets/types";
import { filesUnder, trimDir } from "@/lib/evaluation/trial-files";

const entries = (...paths: string[]) => paths.map((path) => ({ path, size: 1 }));
const paths = (files: { path: string }[]) => files.map((f) => f.path);
const HASH = "5fc5d83e2db1dd8cbc6c508e273fbd9604fc38d743443435755405a7ce91809d";

describe("filesUnder", () => {
  const archive = entries(
    "support/harbor.yaml",
    "support/agent/run.py",
    "support/agent/start.sh",
    "support/agent-notes.md",
    "support/tasks/refund/instruction.md",
    "support/tasks/refund-partial/instruction.md"
  );

  it("keeps only the dir's files, relative to it", () => {
    assert.deepEqual(paths(filesUnder(archive, "support/agent/")), ["run.py", "start.sh"]);
    // The trailing slash keeps a sibling with the same prefix out.
    assert.deepEqual(paths(filesUnder(archive, `${trimDir("support/tasks/refund/")}/`)), ["instruction.md"]);
    assert.deepEqual(paths(filesUnder(archive, "")), paths(archive));
  });
});

describe("buildTrialTree", () => {
  it("puts task, agent and logs under three roots, in that order", () => {
    const tree = buildTrialTree({
      logs: entries("trial.log", "agent/oracle.txt"),
      agent: entries("run.py"),
      task: entries("instruction.md", "tests/test.sh"),
    });
    assert.deepEqual(
      tree.map((n) => [n.name, n.path]),
      [
        ["task", "task"],
        ["agent", "agent"],
        ["logs", "logs"],
      ]
    );
    assert.deepEqual(paths(flattenFiles(tree)), [
      "task/tests/test.sh",
      "task/instruction.md",
      "agent/run.py",
      "logs/agent/oracle.txt",
      "logs/trial.log",
    ]);
  });

  it("leaves out roots that aren't available or are empty", () => {
    assert.deepEqual(
      buildTrialTree({ task: entries("instruction.md"), agent: null, logs: [] }).map((n) => n.name),
      ["task"]
    );
    assert.deepEqual(buildTrialTree({ task: null, agent: null, logs: null }), []);
  });
});

describe("defaultTrialFile", () => {
  const tree = (logs: string[] | null, task = ["instruction.md", "task.toml"]) =>
    flattenFiles(buildTrialTree({ task: entries(...task), agent: entries("run.py"), logs: logs && entries(...logs) }));
  const trial = ["agent/oracle.txt", "result.json", "trial.log", "verifier/test-stdout.txt"];
  const open = (logs: string[] | null, options: { failed?: boolean; preferred?: string | null } = {}) =>
    defaultTrialFile(tree(logs), { failed: false, ...options })?.path;

  it("opens the task's instruction for a passed trial", () => {
    assert.equal(open(trial), "task/instruction.md");
  });

  it("opens the most telling log for a failed trial", () => {
    const failed = { failed: true };
    assert.equal(open([...trial, "agent/run_case.log", "exception.txt"], failed), "logs/agent/run_case.log");
    assert.equal(open([...trial, "exception.txt"], failed), "logs/agent/oracle.txt");
    assert.equal(open(["exception.txt", "trial.log", "verifier/test-stdout.txt"], failed), "logs/exception.txt");
    assert.equal(open(["result.json", "trial.log"], failed), "logs/trial.log");
    // No logs yet (or none of the known files): the instruction.
    assert.equal(open(["result.json"], failed), "task/instruction.md");
    assert.equal(open(null, failed), "task/instruction.md");
  });

  it("keeps the file opened in another trial when this one has it", () => {
    assert.equal(open(trial, { preferred: "logs/verifier/test-stdout.txt" }), "logs/verifier/test-stdout.txt");
    assert.equal(open(trial, { preferred: "task/task.toml" }), "task/task.toml");
    assert.equal(open(trial, { preferred: "agent/run.py", failed: true }), "agent/run.py");
    assert.equal(open(trial, { preferred: "logs/agent/run_case.log" }), "task/instruction.md");
  });

  it("falls back to the first file without an instruction", () => {
    assert.equal(defaultTrialFile(tree(trial, ["task.toml"]), { failed: false })?.path, "task/task.toml");
    assert.equal(defaultTrialFile([], { failed: true }), null);
  });
});

describe("trialFilesUrls", () => {
  const urls = trialFilesUrls("p", "e", { task: "refund", hash: HASH, taskPath: null }, "refund__abc");
  const base = "/api/projects/p/evaluations/e/files";

  it("sends only the task ref fields it has", () => {
    assert.equal(urls.task, `${base}/task?task=refund&hash=${HASH}`);
    assert.equal(urls.logs, `${base}/logs?trial=refund__abc`);
    assert.equal(trialFilesUrls("p", "e", { task: null, hash: null, taskPath: null }, null).logs, null);
  });

  it("routes a tree path to its root's content route, relative to the root", () => {
    assert.equal(
      urls.content("task/tests/test sh"),
      `${base}/task/content?task=refund&hash=${HASH}&path=tests%2Ftest%20sh`
    );
    assert.equal(urls.content("agent/run.py"), `${base}/agent/content?path=run.py`);
    assert.equal(urls.content("logs/trial.log"), `${base}/logs/content?trial=refund__abc&path=trial.log`);
  });

  it("splits tree paths by root", () => {
    assert.deepEqual(splitTreePath("logs/agent/x.log"), { root: "logs", rest: "agent/x.log" });
    assert.deepEqual(splitTreePath("other/x"), { root: null, rest: "other/x" });
  });
});

describe("task version names", () => {
  it("accepts the names and hashes lmnr-cli writes and nothing that could leave a key segment", () => {
    assert.equal(isDatasetName("support"), true);
    assert.equal(isTaskName("refund.v2_partial-1"), true);
    for (const bad of ["", ".hidden", "a/b", "..", "a b", "x".repeat(101)]) {
      assert.equal(isDatasetName(bad), false, bad);
    }
    assert.equal(isTaskName("x".repeat(255)), true);
    assert.equal(isTaskHash(HASH), true);
    assert.equal(isTaskHash(`sha256:${HASH}`), false);
    assert.equal(isTaskHash(HASH.toUpperCase()), false);
  });

  it("reads a trial's task version hash only when it is one", () => {
    assert.equal(taskVersionHashOf({ taskVersionHash: HASH }), HASH);
    assert.equal(taskVersionHashOf({ taskVersionHash: "" }), null);
    assert.equal(taskVersionHashOf(undefined), null);
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
