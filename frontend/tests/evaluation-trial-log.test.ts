import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFileTree, flattenFiles } from "@/components/evaluation/task-files/utils";
import { defaultLogFile, summarizeResult } from "@/components/evaluation/trial-log/utils";

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

describe("summarizeResult", () => {
  it("reads phase timings and the exception from Harbor's result.json", () => {
    // Trimmed from a Harbor 0.25.0 trial whose agent timed out.
    const result = {
      trial_name: "hello__jn9EohR",
      started_at: "2026-11-12T09:40:03.848953Z",
      finished_at: "2026-11-12T09:40:18.328574Z",
      environment_setup: { started_at: "2026-11-12T09:40:03.907599Z", finished_at: "2026-11-12T09:40:07.291417Z" },
      agent_setup: { started_at: "2026-11-12T09:40:07.291462Z", finished_at: "2026-11-12T09:40:07.291517Z" },
      agent_execution: { started_at: "2026-11-12T09:40:07.291592Z", finished_at: "2026-11-12T09:40:10.291592Z" },
      verifier: null,
      exception_info: {
        exception_type: "AgentTimeoutError",
        exception_message: "Agent execution timed out after 3.0 seconds",
        exception_traceback: "Traceback ...",
      },
    };
    const summary = summarizeResult(JSON.stringify(result));
    assert.deepEqual(
      summary?.durations.map((d) => d.label),
      ["Total", "Environment", "Agent setup", "Agent"]
    );
    assert.equal(summary?.durations[3].ms, 3000);
    assert.deepEqual(summary?.exception, {
      type: "AgentTimeoutError",
      message: "Agent execution timed out after 3.0 seconds",
    });
  });

  it("gives nothing for a file that isn't a trial result", () => {
    assert.equal(summarizeResult("not json"), null);
    assert.equal(summarizeResult(JSON.stringify({ started_at: 5 })), null);
  });
});
