import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIdBatchFetcher, createIdBatchLoader } from "@/lib/id-batch-loader";

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

const setup = (fail = new Set<number>()) => {
  const loaded: Record<string, string> = {};
  const failed: string[][] = [];
  const calls: string[][] = [];
  let release: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  const request = createIdBatchLoader<string>({
    load: async (ids) => {
      calls.push(ids);
      if (gate) await gate;
      if (fail.has(calls.length)) throw new Error("network");
      return Object.fromEntries(ids.filter((id) => id !== "missing").map((id) => [id, `v-${id}`]));
    },
    onLoaded: (_ids, values) => Object.assign(loaded, values),
    onFailed: (ids) => failed.push(ids),
    batchSize: 2,
    debounceMs: 0,
  });
  const hold = () => {
    gate = new Promise((r) => (release = r));
  };
  return { request, loaded, failed, calls, hold, release: () => release?.() };
};

describe("createIdBatchLoader", () => {
  it("coalesces requests in one window and chunks by batch size", async () => {
    const { request, loaded, calls } = setup();
    request(["a", "b"]);
    request(["b", "c"]);
    await settle();
    assert.deepEqual(calls, [["a", "b"], ["c"]]);
    assert.deepEqual(loaded, { a: "v-a", b: "v-b", c: "v-c" });
  });

  it("skips ids already in flight, then loads them again once settled", async () => {
    const { request, calls, hold, release } = setup();
    hold();
    request(["a"]);
    await settle();
    request(["a", "b"]);
    release();
    await settle();
    request(["a"]);
    await settle();
    assert.deepEqual(calls, [["a"], ["b"], ["a"]]);
  });

  it("reports a thrown chunk's ids as failed, and a later request retries them", async () => {
    const { request, loaded, failed, calls } = setup(new Set([1]));
    request(["a", "b", "c"]);
    await settle();
    assert.deepEqual(failed, [["a", "b"]]);
    request(["a"]);
    await settle();
    assert.deepEqual(calls, [["a", "b"], ["c"], ["a"]]);
    assert.deepEqual(loaded, { a: "v-a", c: "v-c" });
  });
});

describe("createIdBatchFetcher", () => {
  it("loads ids asked for together in one chunked request each", async () => {
    const calls: string[][] = [];
    const load = createIdBatchFetcher(
      async (ids) => {
        calls.push(ids);
        return Object.fromEntries(ids.filter((id) => id !== "c").map((id) => [id, id.toUpperCase()]));
      },
      { debounceMs: 0, batchSize: 2 }
    );
    const results = await Promise.all([load("a"), load("b"), load("c"), load("a")]);
    assert.deepEqual(results, ["A", "B", undefined, "A"]);
    assert.deepEqual(calls, [["a", "b"], ["c"]]);
  });

  it("rejects every id in a failed chunk", async () => {
    const load = createIdBatchFetcher(async () => Promise.reject(new Error("boom")), { debounceMs: 0 });
    await assert.rejects(load("a"), /boom/);
  });
});
