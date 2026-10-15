import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  createDebouncedEvaluationRefetch,
  createEvaluationRealtimeHandlers,
  shouldMergeEvaluationRealtimeLocally,
} from "@/components/evaluation/realtime-query-state";
import { type EvalRow } from "@/lib/evaluation/types";

const event = (data: unknown): MessageEvent => new MessageEvent("evaluation", { data: JSON.stringify(data) });

const query = (overrides: Partial<Parameters<typeof shouldMergeEvaluationRealtimeLocally>[0]> = {}) => ({
  isComparison: false,
  search: null,
  filter: [],
  sortBy: null,
  sortDirection: null,
  ...overrides,
});

describe("evaluation realtime query state", () => {
  it("keeps the local merge only for the live default index query", () => {
    assert.equal(shouldMergeEvaluationRealtimeLocally(query()), true);
    assert.equal(shouldMergeEvaluationRealtimeLocally(query({ search: "visible" })), false);
    assert.equal(shouldMergeEvaluationRealtimeLocally(query({ filter: ['{"column":"metadata"}'] })), false);
    assert.equal(
      shouldMergeEvaluationRealtimeLocally(query({ sortBy: "score:quality", sortDirection: "desc" })),
      false
    );
    assert.equal(shouldMergeEvaluationRealtimeLocally(query({ sortBy: "index", sortDirection: "asc" })), false);
    assert.equal(shouldMergeEvaluationRealtimeLocally(query({ isComparison: true })), false);
  });

  it("merges default-order upserts locally and preserves score/stats side effects", () => {
    let rows: EvalRow[] = [{ id: "existing", index: 1 }];
    const scoreNames: string[] = [];
    let statsRevalidations = 0;
    let refetches = 0;
    const handlers = createEvaluationRealtimeHandlers({
      isComparison: false,
      mergeLocally: true,
      updateData: (updater) => {
        rows = updater(rows);
      },
      addScoreName: (name) => scoreNames.push(name),
      revalidateStats: () => {
        statsRevalidations += 1;
      },
      scheduleRefetch: () => {
        refetches += 1;
      },
    });

    handlers.datapoint_upsert(
      event({
        datapoints: [{ id: "new", index: 0, scores: JSON.stringify({ quality: 0.9 }) }],
      })
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ["new", "existing"]
    );
    assert.deepEqual(scoreNames, ["quality"]);
    assert.equal(statsRevalidations, 1);
    assert.equal(refetches, 0);
  });

  it("refetches instead of locally admitting rows under filters/search/custom sort", () => {
    let updates = 0;
    let refetches = 0;
    const handlers = createEvaluationRealtimeHandlers({
      isComparison: false,
      mergeLocally: false,
      updateData: () => {
        updates += 1;
      },
      addScoreName: () => {},
      revalidateStats: () => {},
      scheduleRefetch: () => {
        refetches += 1;
      },
    });

    handlers.datapoint_upsert(event({ datapoints: [{ id: "nonmatching", index: 0, metadata: '{"env":"dev"}' }] }));
    handlers.datapoint_upsert(event({ datapoints: [{ id: "searchable", index: 1, data: "needle" }] }));
    handlers.trace_update(event({ traces: [{ id: "trace-1", duration: 10 }] }));

    assert.equal(updates, 0);
    assert.equal(refetches, 3);
  });

  it("retains score and stats side effects while a constrained query is active", () => {
    const scoreNames: string[] = [];
    let statsRevalidations = 0;
    let refetches = 0;
    const handlers = createEvaluationRealtimeHandlers({
      isComparison: false,
      mergeLocally: false,
      updateData: () => {},
      addScoreName: (name) => scoreNames.push(name),
      revalidateStats: () => {
        statsRevalidations += 1;
      },
      scheduleRefetch: () => {
        refetches += 1;
      },
    });

    handlers.datapoint_upsert(
      event({
        datapoints: [
          { id: "new", index: 0, scores: JSON.stringify({ fresh: 0.7 }) },
          { id: "newer", index: 1, scores: JSON.stringify({ fresh: 0.8 }) },
        ],
      })
    );

    assert.deepEqual(scoreNames, ["fresh", "fresh"]);
    assert.equal(statsRevalidations, 2);
    assert.equal(refetches, 1);
  });

  it("does not process comparison-mode realtime events", () => {
    let updates = 0;
    let refetches = 0;
    let statsRevalidations = 0;
    const handlers = createEvaluationRealtimeHandlers({
      isComparison: true,
      mergeLocally: false,
      updateData: () => {
        updates += 1;
      },
      addScoreName: () => {},
      revalidateStats: () => {
        statsRevalidations += 1;
      },
      scheduleRefetch: () => {
        refetches += 1;
      },
    });

    handlers.datapoint_upsert(event({ datapoints: [{ id: "ignored", index: 0, scores: '{"x":1}' }] }));
    handlers.trace_update(event({ traces: [{ id: "ignored-trace" }] }));

    assert.equal(updates, 0);
    assert.equal(refetches, 0);
    assert.equal(statsRevalidations, 0);
  });

  it("coalesces bursts and cancels pending work", async () => {
    let refetches = 0;
    const refetch = createDebouncedEvaluationRefetch(() => {
      refetches += 1;
    }, 10);

    refetch.schedule();
    refetch.schedule();
    refetch.schedule();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(refetches, 1);

    refetch.schedule();
    refetch.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(refetches, 1);
  });

  it("flushes a sustained event stream within maxWait instead of starving", () => {
    mock.timers.enable({ apis: ["Date", "setTimeout"] });
    try {
      let refetches = 0;
      const refetch = createDebouncedEvaluationRefetch(
        () => {
          refetches += 1;
        },
        10,
        30
      );

      // Every event arrives before the normal trailing wait expires. Without
      // maxWait, the callback would still be pending at t=40ms.
      for (let eventNumber = 0; eventNumber < 8; eventNumber += 1) {
        refetch.schedule();
        mock.timers.tick(5);
      }

      assert.equal(refetches, 1);
      refetch.cancel();
    } finally {
      mock.timers.reset();
    }
  });
});
