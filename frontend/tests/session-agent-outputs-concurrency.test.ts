import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { type BaseSessionViewStore, createBaseSessionViewSlice } from "@/components/traces/session-view/store/base";

// OUTPUT_CHUNK_SIZE / OUTPUT_MAX_CONCURRENCY are module-private; mirror them here.
const CHUNK_SIZE = 5;
const MAX_CONCURRENCY = 6;

const DEBOUNCE_MS = 150;

const traceIds = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => `trace-${i + offset}`);

/** Minimal zustand-like store over the slice, plus a fetch stub that records
 *  peak concurrency and lets each request be resolved manually. */
const makeHarness = () => {
  let state: BaseSessionViewStore;
  const set = (partial: unknown) => {
    const patch = typeof partial === "function" ? (partial as (s: unknown) => object)(state) : partial;
    state = { ...state, ...(patch as object) };
  };
  const get = () => state;
  state = createBaseSessionViewSlice<BaseSessionViewStore>(set as never, get as never, {});
  state.projectId = "project-1";

  let inFlight = 0;
  let peakInFlight = 0;
  const pendingResolvers: Array<() => void> = [];
  const requestedChunks: string[][] = [];

  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const { traceIds: ids } = JSON.parse(init.body) as { traceIds: string[] };
    requestedChunks.push(ids);
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await new Promise<void>((resolve) => pendingResolvers.push(resolve));
    inFlight--;
    return {
      ok: true,
      json: async () => Object.fromEntries(ids.map((id) => [id, `out:${id}`])),
    };
  }) as never;

  return {
    store: () => state,
    peakInFlight: () => peakInFlight,
    inFlight: () => inFlight,
    requestedChunks: () => requestedChunks,
    /** Settle all currently-open requests and let continuations run. */
    settleAll: async () => {
      while (pendingResolvers.length > 0) {
        pendingResolvers.splice(0).forEach((resolve) => resolve());
        // Let the awaiting workers advance (fetch + json + set are each a tick).
        for (let i = 0; i < 6; i++) await Promise.resolve();
      }
    },
  };
};

describe("session view agentOutputs fetching", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  beforeEach(() => {
    // node:test fake timers so the 150ms debounce is deterministic.
  });

  it("caps in-flight requests across OVERLAPPING flushes, not per flush", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const h = makeHarness();

    // Flush 1: enough chunks to saturate the worker pool.
    h.store().fetchAgentOutputs(traceIds(CHUNK_SIZE * MAX_CONCURRENCY));
    t.mock.timers.tick(DEBOUNCE_MS);
    await Promise.resolve();
    assert.equal(h.inFlight(), MAX_CONCURRENCY, "first flush should saturate the pool");

    // Flush 2 lands while flush 1's requests are still open — this is what
    // continuous scrolling does. A per-flush worker pool would spin up a second
    // set of MAX_CONCURRENCY workers here (12 in flight).
    h.store().fetchAgentOutputs(traceIds(CHUNK_SIZE * MAX_CONCURRENCY, 1000));
    t.mock.timers.tick(DEBOUNCE_MS);
    await Promise.resolve();

    assert.equal(
      h.peakInFlight(),
      MAX_CONCURRENCY,
      `expected at most ${MAX_CONCURRENCY} concurrent requests, saw ${h.peakInFlight()}`
    );

    await h.settleAll();
    // Every id from both flushes still resolves.
    assert.equal(Object.keys(h.store().agentOutputs).length, CHUNK_SIZE * MAX_CONCURRENCY * 2);
  });

  it("chunks ids at OUTPUT_CHUNK_SIZE and resolves each id", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const h = makeHarness();

    h.store().fetchAgentOutputs(traceIds(12));
    t.mock.timers.tick(DEBOUNCE_MS);
    await h.settleAll();

    assert.deepStrictEqual(
      h.requestedChunks().map((c) => c.length),
      [5, 5, 2]
    );
    assert.equal(h.store().agentOutputs["trace-0"], "out:trace-0");
    assert.equal(h.store().agentOutputs["trace-11"], "out:trace-11");
  });

  it("skips ids already resolved or in flight", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const h = makeHarness();

    h.store().fetchAgentOutputs(["a", "b"]);
    t.mock.timers.tick(DEBOUNCE_MS);
    await Promise.resolve();
    // Re-request the same ids while in flight, plus one new id.
    h.store().fetchAgentOutputs(["a", "b", "c"]);
    t.mock.timers.tick(DEBOUNCE_MS);
    await h.settleAll();

    const requested = h.requestedChunks().flat();
    assert.deepStrictEqual(requested.filter((id) => id === "a").length, 1, "'a' must be fetched once");
    assert.ok(requested.includes("c"));

    // Already-resolved ids are not re-fetched.
    const before = h.requestedChunks().length;
    h.store().fetchAgentOutputs(["a", "b", "c"]);
    t.mock.timers.tick(DEBOUNCE_MS);
    await h.settleAll();
    assert.equal(h.requestedChunks().length, before);
  });

  it("marks a failed chunk as resolved-with-null so it is not retried in a loop", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const h = makeHarness();
    globalThis.fetch = (async () => ({ ok: false, json: async () => ({}) })) as never;

    h.store().fetchAgentOutputs(["x", "y"]);
    t.mock.timers.tick(DEBOUNCE_MS);
    await h.settleAll();

    assert.equal(h.store().agentOutputs["x"], null);
    assert.equal(h.store().agentOutputs["y"], null);
  });
});
