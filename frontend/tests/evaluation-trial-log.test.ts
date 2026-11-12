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
  it("opens the traceback of a failed trial first, then the agent's output", () => {
    const trial = ["agent/oracle.txt", "result.json", "trial.log", "verifier/test-stdout.txt"];
    assert.equal(defaultLogFile(files(...trial, "exception.txt"))?.path, "exception.txt");
    assert.equal(defaultLogFile(files(...trial))?.path, "agent/oracle.txt");
    assert.equal(defaultLogFile(files("result.json", "trial.log"))?.path, "trial.log");
    assert.equal(defaultLogFile(files("steps/one/agent/out.txt"))?.path, "steps/one/agent/out.txt");
    assert.equal(defaultLogFile([]), null);
  });
});
