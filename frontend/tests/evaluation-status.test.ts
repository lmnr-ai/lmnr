import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveEvaluationStatus,
  EVALUATION_STALE_AFTER_MS,
  type EvaluationStatusCounts,
} from "@/lib/evaluation/status";

// Pins the eval-level run status contract (LAM-2062). The load-bearing facts:
// completion needs BOTH halves (root span + scores) for every datapoint, an
// errored trace counts as settled (it never produces a root span), and — because
// no expected-datapoint count exists anywhere — a stalled run is separated from
// a live one purely by staleness.

const NOW = Date.parse("2026-08-03T12:00:00.000Z");
const fresh = new Date(NOW - 60_000).toISOString();
const stale = new Date(NOW - EVALUATION_STALE_AFTER_MS - 60_000).toISOString();

const counts = (over: Partial<EvaluationStatusCounts> = {}): EvaluationStatusCounts => ({
  total: 10,
  rooted: 10,
  scored: 10,
  errored: 0,
  lastUpdatedAt: fresh,
  ...over,
});

describe("deriveEvaluationStatus", () => {
  it("reports empty when there are no datapoints", () => {
    assert.equal(deriveEvaluationStatus(counts({ total: 0, rooted: 0, scored: 0 }), NOW), "empty");
  });

  it("reports finished when every datapoint is rooted and scored", () => {
    assert.equal(deriveEvaluationStatus(counts(), NOW), "finished");
  });

  it("reports finishedWithErrors when a trace errored but everything settled", () => {
    // 9 rooted + 1 errored == 10 settled; all 10 scored.
    assert.equal(deriveEvaluationStatus(counts({ rooted: 9, errored: 1 }), NOW), "finishedWithErrors");
  });

  it("treats an all-errored run as terminal rather than forever-running", () => {
    // Errored traces never produce a root span, so without counting them as
    // settled this run would spin as `running` indefinitely.
    assert.equal(deriveEvaluationStatus(counts({ rooted: 0, errored: 10 }), NOW), "finishedWithErrors");
  });

  it("stays running while root spans are still missing", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: 4 }), NOW), "running");
  });

  it("stays running while scores are still missing", () => {
    assert.equal(deriveEvaluationStatus(counts({ scored: 4 }), NOW), "running");
  });

  it("flags an unchanged incomplete run as incomplete", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: 4, lastUpdatedAt: stale }), NOW), "incomplete");
  });

  it("does not flag a COMPLETE run as incomplete no matter how old it is", () => {
    // Staleness must only ever downgrade an incomplete run — a finished eval
    // from last year is still finished.
    assert.equal(deriveEvaluationStatus(counts({ lastUpdatedAt: stale }), NOW), "finished");
  });

  it("prefers running over incomplete when the timestamp is missing or unparseable", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: 1, lastUpdatedAt: null }), NOW), "running");
    assert.equal(deriveEvaluationStatus(counts({ rooted: 1, lastUpdatedAt: "not-a-date" }), NOW), "running");
  });

  it("does not let counters above total spill into a wrong state", () => {
    // RMT pre-merge duplicates could in principle over-count a countIf; the
    // clamp keeps `settled` from exceeding total in a way that matters.
    assert.equal(deriveEvaluationStatus(counts({ rooted: 12, errored: 3 }), NOW), "finishedWithErrors");
  });

  it("treats negative counters defensively as zero", () => {
    assert.equal(deriveEvaluationStatus(counts({ rooted: -1, scored: -1, lastUpdatedAt: fresh }), NOW), "running");
  });
});
