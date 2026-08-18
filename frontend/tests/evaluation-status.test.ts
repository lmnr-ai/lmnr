import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  datapointBuckets,
  deriveDatapointStatus,
  deriveEvaluationStatus,
  EVALUATION_STALE_AFTER_MS,
  type EvaluationStatus,
  type EvaluationStatusCounts,
} from "@/lib/evaluation/status";

const NOW = Date.parse("2026-04-01T12:00:00.000Z");
const FRESH = new Date(NOW).toISOString();
const STALE_AT = new Date(NOW - EVALUATION_STALE_AFTER_MS - 1).toISOString();

const counts = (over: Partial<EvaluationStatusCounts> = {}): EvaluationStatusCounts => ({
  total: 0,
  complete: 0,
  errored: 0,
  stale: 0,
  ...over,
});

describe("deriveEvaluationStatus", () => {
  const cases: [string, EvaluationStatusCounts, EvaluationStatus | null][] = [
    ["no datapoints", counts(), null],
    ["all complete", counts({ total: 10, complete: 10 }), "complete"],
    ["all complete, some errors", counts({ total: 10, complete: 10, errored: 2 }), "completeWithErrors"],
    ["all errored", counts({ total: 10, complete: 10, errored: 10 }), "completeWithErrors"],
    ["still pending", counts({ total: 10, complete: 5 }), "running"],
    ["remaining are stale", counts({ total: 10, complete: 7, stale: 3 }), "incomplete"],
    ["mix of pending and stale", counts({ total: 10, complete: 7, stale: 2 }), "running"],
    ["clamps complete above total", counts({ total: 10, complete: 20, errored: 1 }), "completeWithErrors"],
    ["clamps negatives to running", counts({ total: 10, complete: -4, errored: -1 }), "running"],
  ];

  it("classifies from counters", () => {
    for (const [name, c, expected] of cases) {
      assert.equal(deriveEvaluationStatus(c), expected, name);
    }
  });
});

describe("deriveDatapointStatus", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["object scores", { scores: { accuracy: 0.9 } }, "complete"],
    ["json scores", { scores: '{"accuracy":0.9}' }, "complete"],
    ["zero score still complete", { scores: { accuracy: 0 } }, "complete"],
    ["complete is never stale", { scores: { accuracy: 0.9 }, createdAt: STALE_AT }, "complete"],
    ["trace error", { traceStatus: "error" }, "error"],
    ["error wins over scores", { scores: { accuracy: 0.9 }, traceStatus: "error" }, "error"],
    ["error is never stale", { createdAt: STALE_AT, traceStatus: "error" }, "error"],
    ["fresh empty", { scores: {}, createdAt: FRESH }, "running"],
    ["stale empty", { scores: {}, createdAt: STALE_AT }, "stale"],
    ["empty object", { scores: {} }, "running"],
    ["empty json", { scores: "{}" }, "running"],
    ["empty string", { scores: "" }, "running"],
    ["non-empty blob counts as scored", { scores: "not-json" }, "complete"],
    ["ignore score:* when blob present", { scores: {}, "score:accuracy": 0.9 }, "running"],
    ["score:* when blob absent", { scores: null, "score:accuracy": 0.9 }, "complete"],
    ["updatedAt beats createdAt", { createdAt: STALE_AT, updatedAt: FRESH }, "running"],
    ["missing timestamp", {}, "running"],
  ];

  it("classifies from row fields", () => {
    for (const [name, row, expected] of cases) {
      assert.equal(deriveDatapointStatus(row, NOW), expected, name);
    }
  });
});

describe("datapointBuckets", () => {
  it("splits settled vs remaining", () => {
    assert.deepEqual(datapointBuckets({ total: 10, complete: 6, errored: 1, stale: 2 }), {
      total: 10,
      complete: 5,
      inProgress: 2,
      stale: 2,
      errored: 1,
    });
    assert.deepEqual(datapointBuckets({ total: 10, complete: -4, errored: -1 }), {
      total: 10,
      complete: 0,
      inProgress: 10,
      stale: 0,
      errored: 0,
    });
    assert.deepEqual(datapointBuckets({ total: 10, complete: 20, errored: 3, stale: 5 }), {
      total: 10,
      complete: 7,
      inProgress: 0,
      stale: 0,
      errored: 3,
    });
  });
});
