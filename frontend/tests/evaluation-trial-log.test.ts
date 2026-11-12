import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFileTree, flattenFiles } from "@/components/evaluation/task-files/utils";
import { defaultLogFile } from "@/components/evaluation/trial-log/utils";

const files = (...paths: string[]) =>
  flattenFiles(
    buildFileTree(
      paths.map((path) => ({ path, size: 1 })),
      ""
    )
  );

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
