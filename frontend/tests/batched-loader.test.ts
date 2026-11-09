import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createBatchedLoader } from "@/lib/batched-loader";

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

const setup = (fail = new Set<number>()) => {
  const resolved: Record<string, string> = {};
  const calls: string[][] = [];
  let release: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  const loader = createBatchedLoader<string>({
    load: async (ids) => {
      calls.push(ids);
      if (gate) await gate;
      if (fail.has(calls.length)) return undefined;
      return Object.fromEntries(ids.map((id) => [id, `v-${id}`]));
    },
    onLoaded: (values) => Object.assign(resolved, values),
    isResolved: (id) => id in resolved,
    batchSize: 2,
    debounceMs: 0,
  });
  const hold = () => {
    gate = new Promise((r) => (release = r));
  };
  return { loader, resolved, calls, hold, release: () => release?.() };
};

describe("createBatchedLoader", () => {
  it("coalesces requests in one window and chunks by batch size", async () => {
    const { loader, resolved, calls } = setup();
    loader.request(["a", "b"]);
    loader.request(["b", "c"]);
    await settle();
    assert.deepEqual(calls, [["a", "b"], ["c"]]);
    assert.deepEqual(resolved, { a: "v-a", b: "v-b", c: "v-c" });
  });

  it("skips ids already resolved or in flight", async () => {
    const { loader, calls, hold, release } = setup();
    loader.request(["a"]);
    await settle();
    hold();
    loader.request(["a", "b"]);
    await settle();
    loader.request(["b"]);
    release();
    await settle();
    assert.deepEqual(calls, [["a"], ["b"]]);
  });

  it("leaves a failed chunk unresolved so a later request retries it", async () => {
    const { loader, resolved, calls } = setup(new Set([1]));
    loader.request(["a"]);
    await settle();
    assert.deepEqual(resolved, {});
    loader.request(["a"]);
    await settle();
    assert.deepEqual(calls, [["a"], ["a"]]);
    assert.deepEqual(resolved, { a: "v-a" });
  });

  it("treats a thrown load like a failure", async () => {
    const resolved: Record<string, number> = {};
    let attempts = 0;
    const loader = createBatchedLoader<number>({
      load: async (ids) => {
        attempts += 1;
        if (attempts === 1) throw new Error("network");
        return Object.fromEntries(ids.map((id) => [id, 1]));
      },
      onLoaded: (values) => Object.assign(resolved, values),
      isResolved: (id) => id in resolved,
      debounceMs: 0,
    });
    loader.request(["a"]);
    await settle();
    loader.request(["a"]);
    await settle();
    assert.equal(attempts, 2);
    assert.deepEqual(resolved, { a: 1 });
  });
});

describe("createBatchedLoader onFailed", () => {
  it("reports the ids of a failed chunk", async () => {
    const failed: string[][] = [];
    const loader = createBatchedLoader<number>({
      load: async () => undefined,
      onLoaded: () => {},
      onFailed: (ids) => failed.push(ids),
      isResolved: () => false,
      batchSize: 2,
      debounceMs: 0,
    });
    loader.request(["a", "b", "c"]);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(failed, [["a", "b"], ["c"]]);
  });
});
