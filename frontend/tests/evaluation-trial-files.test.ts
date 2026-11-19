import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFileTree, expandTo, flattenFiles } from "@/components/evaluation/task-files/utils";
import { defaultLogFile } from "@/components/evaluation/trial-files/log-files";
import {
  buildTrialTree,
  defaultTrialFile,
  filesAvailability,
  mayHaveTaskVersion,
  showFilesToggle,
} from "@/components/evaluation/trial-files/utils";
import { groupTaskVersions } from "@/lib/actions/eval-datasets/types";
import {
  type ArchiveFile,
  isEvalName,
  joinArchivePath,
  listTrialFiles,
  nameToPath,
  resolveTrialPath,
  type TrialFiles,
  type TrialFileSources,
  taskVersionPrefix,
} from "@/lib/evaluation/trial-files";

const files = (...paths: string[]) =>
  flattenFiles(
    buildFileTree(
      paths.map((path) => ({ path, size: 1 })),
      ""
    )
  );

const archive = (...paths: string[]): ArchiveFile[] => paths.map((path) => ({ path, size: 1 }));

describe("defaultLogFile", () => {
  const trial = ["agent/oracle.txt", "result.json", "trial.log", "verifier/test-stdout.txt"];

  it("opens the agent's own logs first, then its output, the traceback and the verifier's", () => {
    assert.equal(defaultLogFile(files(...trial, "agent/run_case.log", "exception.txt"))?.path, "agent/run_case.log");
    assert.equal(defaultLogFile(files(...trial, "exception.txt"))?.path, "agent/oracle.txt");
    assert.equal(
      defaultLogFile(files("exception.txt", "trial.log", "verifier/test-stdout.txt"))?.path,
      "exception.txt"
    );
    assert.equal(defaultLogFile(files("result.json", "trial.log"))?.path, "trial.log");
    assert.equal(defaultLogFile(files("steps/one/agent/out.txt"))?.path, "steps/one/agent/out.txt");
    assert.equal(defaultLogFile([]), null);
  });

  it("keeps the file opened in another trial when this one has it", () => {
    assert.equal(defaultLogFile(files(...trial), "verifier/test-stdout.txt")?.path, "verifier/test-stdout.txt");
    assert.equal(defaultLogFile(files(...trial), "agent/run_case.log")?.path, "agent/oracle.txt");
  });
});

describe("trial file sources", () => {
  const upload = archive(
    "ds/harbor.yaml",
    "ds/agent/agent.py",
    "ds/agent/lib/util.py",
    "ds/tasks/refund/instruction.md",
    "ds/tasks/refund/tests/test.sh",
    "ds/tasks/refund-2/instruction.md"
  );
  const job = archive("refund__abc/trial.log", "refund__abc/agent/oracle.txt", "other__def/trial.log");
  const versionPrefix = taskVersionPrefix("p", "acme/ds", "acme/refund", "h");
  const sources: TrialFileSources = {
    task: { prefix: versionPrefix, dir: "", files: archive("instruction.md", "tests/test.sh") },
    agent: { prefix: "hosted-evals/p/u", dir: joinArchivePath("ds", "agent"), files: upload },
    logs: { prefix: "hosted-evals/p/u/jobs/ds", dir: "refund__abc", files: job },
  };

  it("lists each source under its root, and only the trial's own dirs", () => {
    assert.deepEqual(
      listTrialFiles(sources).map((f) => f.path),
      [
        "task/instruction.md",
        "task/tests/test.sh",
        "agent/agent.py",
        "agent/lib/util.py",
        "logs/trial.log",
        "logs/agent/oracle.txt",
      ]
    );
  });

  it("falls back to the uploaded task dir without matching its siblings by prefix", () => {
    const fallback = { task: { prefix: "hosted-evals/p/u", dir: "ds/tasks/refund", files: upload } };
    assert.deepEqual(
      listTrialFiles(fallback).map((f) => f.path),
      ["task/instruction.md", "task/tests/test.sh"]
    );
  });

  it("resolves a tree path to its archive file only when listed", () => {
    assert.deepEqual(resolveTrialPath(sources, "task/tests/test.sh"), {
      prefix: versionPrefix,
      path: "tests/test.sh",
    });
    assert.deepEqual(resolveTrialPath(sources, "agent/agent.py"), {
      prefix: "hosted-evals/p/u",
      path: "ds/agent/agent.py",
    });
    assert.deepEqual(resolveTrialPath(sources, "logs/trial.log"), {
      prefix: "hosted-evals/p/u/jobs/ds",
      path: "refund__abc/trial.log",
    });
    // harbor.yaml is in the upload but outside agent/; another trial's dir is in the job but not this trial's.
    assert.equal(resolveTrialPath(sources, "agent/../harbor.yaml"), null);
    assert.equal(resolveTrialPath(sources, "logs/../other__def/trial.log"), null);
    assert.equal(resolveTrialPath(sources, "task/missing.md"), null);
    assert.equal(resolveTrialPath(sources, "other/instruction.md"), null);
    assert.equal(resolveTrialPath(sources, "task"), null);
    assert.equal(resolveTrialPath(sources, "/task/instruction.md"), null);
    assert.equal(resolveTrialPath({ task: sources.task }, "logs/trial.log"), null);
  });

  it("keys a task version by its dataset's and task's org/name", () => {
    assert.equal(versionPrefix, "p/datasets/acme/ds/acme/refund/h");
  });

  it("joins archive paths, treating an empty or `.` suite path as the root", () => {
    assert.equal(joinArchivePath("", "agent"), "agent");
    assert.equal(joinArchivePath(".", "agent"), "agent");
    assert.equal(joinArchivePath("evals/ds/", "agent"), "evals/ds/agent");
  });
});

describe("trial tree", () => {
  const listing = archive("logs/trial.log", "agent/agent.py", "task/instruction.md", "logs/agent/oracle.txt");

  it("puts the roots in panel order", () => {
    assert.deepEqual(
      buildTrialTree(listing).map((n) => n.path),
      ["task", "agent", "logs"]
    );
  });

  it("opens the instruction, else the best log, else the first file; keeps the previous trial's file", () => {
    const flat = flattenFiles(buildTrialTree(listing));
    assert.equal(defaultTrialFile(flat)?.path, "task/instruction.md");
    assert.equal(defaultTrialFile(flat, "logs/trial.log")?.path, "logs/trial.log");
    assert.equal(defaultTrialFile(flat, "task/missing.md")?.path, "task/instruction.md");
    const noTask = flattenFiles(buildTrialTree(archive("agent/agent.py", "logs/trial.log", "logs/agent/oracle.txt")));
    assert.equal(defaultTrialFile(noTask)?.path, "logs/agent/oracle.txt");
    assert.equal(defaultTrialFile(flattenFiles(buildTrialTree(archive("agent/agent.py"))))?.path, "agent/agent.py");
    assert.equal(defaultTrialFile([]), null);
  });
});

describe("collapsed folders", () => {
  it("expand the ones holding the open file, and only those", () => {
    const collapsed = new Set(["agent", "logs", "logs/verifier"]);
    assert.deepEqual([...expandTo(collapsed, "logs/verifier/reward.txt")], ["agent"]);
    assert.equal(expandTo(collapsed, "task/instruction.md"), collapsed);
    assert.equal(expandTo(collapsed, null), collapsed);
    // A collapsed folder that is the open path's prefix but not its parent stays.
    assert.deepEqual([...expandTo(new Set(["log"]), "logs/a.txt")], ["log"]);
  });
});

describe("Files visibility", () => {
  const found: TrialFiles = {
    trialId: "t",
    files: archive("task/instruction.md"),
    task: { source: "dataset", dataset: "acme/ds", task: "acme/refund", hash: "h", pushedAt: "" },
    logsPending: false,
  };
  const notFound: TrialFiles = { trialId: "t", files: [], task: null, logsPending: false };
  const local = { isShared: false, isHosted: false, canLookUp: true };

  it("always offers Files on remote runs, never on shared evals", () => {
    assert.equal(filesAvailability({ ...local, isHosted: true, listing: undefined }), "available");
    assert.equal(filesAvailability({ ...local, isHosted: true, isShared: true, listing: found }), "unavailable");
  });

  it("offers Files on a local run only once its task version is found", () => {
    assert.equal(filesAvailability({ ...local, listing: undefined }), "loading");
    assert.equal(filesAvailability({ ...local, listing: found }), "available");
    assert.equal(filesAvailability({ ...local, listing: notFound }), "unavailable");
    assert.equal(
      filesAvailability({ ...local, listing: { ...found, task: { source: "upload", path: "x" } } }),
      "unavailable"
    );
    assert.equal(filesAvailability({ ...local, listing: null }), "unavailable");
    assert.equal(filesAvailability({ ...local, canLookUp: false, listing: undefined }), "unavailable");
  });

  it("keeps the toggle as the previous trial had it while the next one loads", () => {
    assert.equal(showFilesToggle("loading", found), true);
    assert.equal(showFilesToggle("loading", notFound), false);
    assert.equal(showFilesToggle("loading", undefined), false);
    assert.equal(showFilesToggle("unavailable", found), false);
    assert.equal(showFilesToggle("available", undefined), true);
  });

  it("looks a local trial up only when it can have a pushed version", () => {
    const row = { id: "t", taskVersionHash: "a".repeat(64), metadata: JSON.stringify({ dataset_task: "acme/refund" }) };
    assert.equal(mayHaveTaskVersion(row, "acme/ds"), true);
    assert.equal(mayHaveTaskVersion({ ...row, taskVersionHash: undefined }, "acme/ds"), true);
    assert.equal(mayHaveTaskVersion(row, null), false);
    assert.equal(mayHaveTaskVersion({ ...row, taskVersionHash: "" }, "acme/ds"), false);
    assert.equal(mayHaveTaskVersion({ ...row, metadata: "{}" }, "acme/ds"), false);
    assert.equal(mayHaveTaskVersion(undefined, "acme/ds"), false);
  });
});

describe("groupTaskVersions", () => {
  it("groups by task and keeps the query's newest-first order", () => {
    const tasks = groupTaskVersions([
      { taskId: "acme/a", hash: "h2", pushedAt: "2026-01-02T00:00:00.000Z" },
      { taskId: "acme/a", hash: "h1", pushedAt: "2026-01-01T00:00:00.000Z" },
      { taskId: "acme/b", hash: "h3", pushedAt: "2026-01-03T00:00:00.000Z" },
    ]);
    assert.deepEqual(
      tasks.map((t) => [t.id, t.versions.map((v) => v.hash)]),
      [
        ["acme/a", ["h2", "h1"]],
        ["acme/b", ["h3"]],
      ]
    );
  });
});

describe("eval dataset and task names", () => {
  it("are Harbor's org/name: two parts, no '..', at most 255 bytes", () => {
    const longest = `${"o".repeat(127)}/${"n".repeat(127)}`;
    for (const good of ["a/b", "A.b-c_d/x1", "acme/support", "a.b/c.d", longest]) {
      assert.equal(isEvalName(good), true, good);
    }
    const tooLong = `${"o".repeat(128)}/${"n".repeat(127)}`;
    for (const bad of [
      "",
      "a",
      "a/b/c",
      "/b",
      "a/",
      "a//b",
      ".a/b",
      "-a/b",
      "a/..b",
      "a..b/c",
      "../b",
      "a/b ",
      "a/b\n",
      "é/b",
      "a%2Fb/c",
      tooLong,
    ]) {
      assert.equal(isEvalName(bad), false, JSON.stringify(bad));
    }
  });

  it("map onto two URL path segments", () => {
    assert.equal(nameToPath("acme/refund-double-charge"), "acme/refund-double-charge");
  });
});
