import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveEvaluationStatus,
  EVALUATION_STALE_AFTER_MS,
  type EvaluationStatusCounts,
} from "@/lib/evaluation/status";

// Pins the eval-level run status contract (LAM-2062). Completion is per
// datapoint: (rooted AND scored) OR errored. Error is terminal even with no
// scores. A stalled run is separated from a live one purely by staleness.

const NOW = Date.parse("2026-08-03T12:00:00.000Z");
const fresh = new Date(NOW - 60_000).toISOString();
const stale = new Date(NOW - EVALUATION_STALE_AFTER_MS - 60_000).toISOString();

const counts = (over: Partial<EvaluationStatusCounts> = {}): EvaluationStatusCounts => ({
  total: 10,
  rooted: 10,
  scored: 10,
  errored: 0,
  complete: 10,
  lastUpdatedAt: fresh,
  ...over,
});

describe("deriveEvaluationStatus", () => {
  it("reports empty when there are no datapoints", () => {
    assert.equal(deriveEvaluationStatus(counts({ total: 0, rooted: 0, scored: 0, complete: 0 }), NOW), "empty");
  });

  it("reports finished when every datapoint is rooted and scored", () => {
    assert.equal(deriveEvaluationStatus(counts(), NOW), "finished");
  });

  it("reports finishedWithErrors when a trace errored but everything settled", () => {
    // 9 rooted+scored + 1 errored == 10 complete.
    assert.equal(deriveEvaluationStatus(counts({ rooted: 9, errored: 1, complete: 10 }), NOW), "finishedWithErrors");
  });

  it("treats an all-errored run as terminal rather than forever-running", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: 0, errored: 10, complete: 10 }), NOW), "finishedWithErrors");
  });

  it("treats an errored datapoint as complete even with no scores", () => {
    // Evaluators often never run after a hard failure. Waiting on scores would
    // leave this run stuck in `incomplete`.
    assert.equal(
      deriveEvaluationStatus(counts({ rooted: 0, scored: 0, errored: 10, complete: 10 }), NOW),
      "finishedWithErrors"
    );
  });

  it("stays running while non-errored datapoints are still missing scores", () => {
    // 5 errored-and-scored + 5 rooted-unscored: complete must NOT use
    // scored+errored (that would be 10 and false-finish the run).
    assert.equal(deriveEvaluationStatus(counts({ rooted: 10, scored: 5, errored: 5, complete: 5 }), NOW), "running");
  });

  it("stays running while root spans are still missing", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: 4, complete: 4 }), NOW), "running");
  });

  it("stays running while scores are still missing", () => {
    assert.equal(deriveEvaluationStatus(counts({ scored: 4, complete: 4 }), NOW), "running");
  });

  it("flags an unchanged incomplete run as incomplete", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: 4, complete: 4, lastUpdatedAt: stale }), NOW), "incomplete");
  });

  it("does not flag a COMPLETE run as incomplete no matter how old it is", () => {
    // Staleness must only ever downgrade an incomplete run — a finished eval
    // from last year is still finished.
    assert.equal(deriveEvaluationStatus(counts({ lastUpdatedAt: stale }), NOW), "finished");
  });

  it("prefers running over incomplete when the timestamp is missing or unparseable", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: 1, complete: 1, lastUpdatedAt: null }), NOW), "running");
    assert.equal(
      deriveEvaluationStatus(counts({ rooted: 1, complete: 1, lastUpdatedAt: "not-a-date" }), NOW),
      "running"
    );
  });

  it("does not let counters above total spill into a wrong state", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: 12, errored: 3, complete: 10 }), NOW), "finishedWithErrors");
  });

  it("treats negative counters defensively as zero", () => {
    assert.equal(
      deriveEvaluationStatus(counts({ rooted: -1, scored: -1, complete: -1, lastUpdatedAt: fresh }), NOW),
      "running"
    );
  });
});
