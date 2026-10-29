import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupTrialsIntoTasks, taskMeanScores } from "@/lib/evaluation/task-groups";

describe("groupTrialsIntoTasks", () => {
  it("keeps single-Trial Tasks as plain rows and averages repeated Trials", () => {
    const rows = [
      { id: "a1", taskId: "a", index: 0, duration: 1, scores: '{"acc":1}', "score:acc": 1 },
      { id: "b1", taskId: "b", index: 1, duration: 4, scores: '{"acc":0}', "score:acc": 0 },
      { id: "a2", taskId: "a", index: 0, duration: 3, scores: '{"acc":0,"q":0.5}', "score:acc": 0, "score:q": 0.5 },
    ];
    const [a, b] = groupTrialsIntoTasks(rows);

    assert.equal(b, rows[1]);
    assert.equal(a["id"], "task:a");
    assert.equal(a["trialCount"], 2);
    assert.equal(a["duration"], 2);
    assert.equal(a["score:acc"], 0.5);
    // Missing from one Trial: averaged over the Trial that has it, not read as 0.
    assert.equal(a["score:q"], 0.5);
    assert.deepEqual(
      (a["subRows"] as { id: string; trialNumber: number }[]).map((t) => [t.id, t.trialNumber]),
      [
        ["a1", 1],
        ["a2", 2],
      ]
    );
  });
});

describe("taskMeanScores", () => {
  it("weighs each Task once", () => {
    const perTask = taskMeanScores([
      { task_id: "a", scores: '{"acc":1}' },
      { task_id: "a", scores: '{"acc":1}' },
      { task_id: "a", scores: '{"acc":1}' },
      { task_id: "b", scores: '{"acc":0}' },
    ]);
    assert.deepEqual(perTask, [{ scores: { acc: 1 } }, { scores: { acc: 0 } }]);
  });
});
