import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyDatapointUpsertsToRows,
  applyDatapointUpsertToEvaluation,
  applyEvaluationCreated,
  applyRunStatsToRows,
  EMPTY_STATUS_COUNTS,
} from "@/components/evaluations/realtime";
import { type Evaluation } from "@/lib/evaluation/types";

const evalRow = (over: Partial<Evaluation> = {}): Evaluation => ({
  id: "eval-1",
  createdAt: "2026-04-01T12:00:00.000Z",
  groupId: "default",
  name: "run",
  projectId: "proj",
  metadata: null,
  dataPointsCount: 0,
  status: null,
  statusCounts: { ...EMPTY_STATUS_COUNTS },
  ...over,
});

describe("applyEvaluationCreated", () => {
  it("prepends a matching-group run", () => {
    const incoming = evalRow({ id: "eval-2", name: "new" });
    const next = applyEvaluationCreated([evalRow()], incoming, "default");
    assert.equal(next[0].id, "eval-2");
    assert.equal(next.length, 2);
    assert.deepEqual(next[0].statusCounts, EMPTY_STATUS_COUNTS);
  });

  it("ignores a different group", () => {
    const rows = [evalRow()];
    const next = applyEvaluationCreated(rows, evalRow({ id: "eval-2", groupId: "other" }), "default");
    assert.equal(next, rows);
  });

  it("accepts a run when no group is selected yet (first-ever eval)", () => {
    const next = applyEvaluationCreated([], evalRow({ id: "eval-2" }), null);
    assert.equal(next[0].id, "eval-2");
  });

  it("does not duplicate an existing id", () => {
    const rows = [evalRow()];
    const next = applyEvaluationCreated(rows, evalRow({ name: "renamed" }), "default");
    assert.equal(next, rows);
  });
});

describe("applyDatapointUpsertToEvaluation", () => {
  it("increments total when index is at or past the current total", () => {
    const row = evalRow({ dataPointsCount: 2, statusCounts: { total: 2, complete: 1, errored: 0, stale: 0 } });
    const next = applyDatapointUpsertToEvaluation(row, { id: "dp-3", index: 2 });
    assert.equal(next.dataPointsCount, 3);
    assert.equal(next.statusCounts?.total, 3);
    assert.equal(next.status, "running");
  });

  it("does not increment when index is below total (already fetched)", () => {
    const row = evalRow({ statusCounts: { total: 5, complete: 2, errored: 0, stale: 0 } });
    const next = applyDatapointUpsertToEvaluation(row, { id: "dp-1", index: 1, scores: '{"a":1}' });
    assert.equal(next, row);
  });

  it("does not increment on a scores-only update (no index)", () => {
    const row = evalRow({ statusCounts: { total: 5, complete: 2, errored: 0, stale: 0 } });
    const next = applyDatapointUpsertToEvaluation(row, { id: "dp-1", scores: '{"a":1}' });
    assert.equal(next, row);
  });

  it("counts a new scored datapoint as complete", () => {
    const row = evalRow({ statusCounts: { total: 0, complete: 0, errored: 0, stale: 0 } });
    const next = applyDatapointUpsertToEvaluation(row, { id: "dp-0", index: 0, scores: '{"a":1}' });
    assert.equal(next.statusCounts?.total, 1);
    assert.equal(next.statusCounts?.complete, 1);
    assert.equal(next.status, "complete");
  });

  it("fills a gap when a later index arrives first", () => {
    const row = evalRow({ statusCounts: { total: 0, complete: 0, errored: 0, stale: 0 } });
    const next = applyDatapointUpsertToEvaluation(row, { id: "dp-4", index: 4 });
    assert.equal(next.statusCounts?.total, 5);
  });
});

describe("applyDatapointUpsertsToRows", () => {
  it("is a no-op for an unknown evaluation (wait for evaluation_created)", () => {
    const rows = [evalRow()];
    const next = applyDatapointUpsertsToRows(rows, "missing", "default", "default", [{ id: "dp", index: 0 }]);
    assert.equal(next, rows);
  });

  it("is a no-op for a different group", () => {
    const rows = [evalRow()];
    const next = applyDatapointUpsertsToRows(rows, "eval-1", "other", "default", [{ id: "dp", index: 0 }]);
    assert.equal(next, rows);
  });
});

describe("applyRunStatsToRows", () => {
  it("overwrites optimistic counters from the ClickHouse reconcile", () => {
    const rows = [
      evalRow({
        statusCounts: { total: 4, complete: 4, errored: 0, stale: 0 },
        status: "complete",
      }),
    ];
    const next = applyRunStatsToRows(rows, {
      "eval-1": { total: 4, complete: 4, errored: 1, stale: 0 },
    });
    assert.equal(next[0].statusCounts?.errored, 1);
    assert.equal(next[0].status, "completeWithErrors");
  });

  it("leaves unrelated rows untouched", () => {
    const rows = [evalRow(), evalRow({ id: "eval-2" })];
    const next = applyRunStatsToRows(rows, { "eval-1": { total: 1, complete: 0, errored: 0, stale: 0 } });
    assert.equal(next[1], rows[1]);
    assert.equal(next[0].statusCounts?.total, 1);
  });
});
