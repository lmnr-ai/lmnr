import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLiveSessionStore, type LiveSessionDeps } from "@/components/traces/chat-session-view/live-session/store";
import {
  applySyncEvent,
  initialSyncState,
  isLive,
  needsReconcile,
  replyOf,
  type SyncEvent,
  type SyncState,
} from "@/components/traces/chat-session-view/live-session/sync";
import { type RealtimeTracePayload, type TraceRow } from "@/lib/traces/types";

const row = (id: string, startTime: string): TraceRow =>
  ({
    id,
    startTime,
    endTime: startTime,
    totalTokens: 10,
    metadata: {},
    status: "",
    spanTags: [],
    traceTags: [],
  }) as unknown as TraceRow;

const delta = (id: string, startTime: string): RealtimeTracePayload => ({
  id,
  startTime,
  endTime: startTime,
  sessionId: "s",
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 1,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  reasoningTokens: 0,
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
  metadata: null,
  topSpanId: null,
  traceType: "DEFAULT",
  topSpanName: null,
  topSpanType: null,
  status: null,
  userId: null,
  tags: [],
});

const T1 = "2026-11-06T10:00:00.000Z";
const T2 = "2026-11-06T10:05:00.000Z";

const run = (...events: SyncEvent[]): SyncState => events.reduce(applySyncEvent, initialSyncState);
const ids = (state: SyncState) => state.traces.map((t) => t.id);

describe("applySyncEvent", () => {
  it("keeps turns that arrived live during the first load", () => {
    // The snapshot was requested before the new turn's delta and returns after it.
    const state = run(
      { type: "delta", traces: [delta("b", T2)] },
      { type: "snapshot", traces: [row("a", T1)], requestedAtSeq: 0 }
    );
    assert.deepEqual(ids(state), ["a", "b"]);
    assert.equal(state.status, "ready");
    assert.ok(isLive(state, "b"));
    assert.ok(needsReconcile(state));
  });

  it("drops turns a snapshot requested after them no longer has", () => {
    const state = run(
      { type: "delta", traces: [delta("b", T2)] },
      { type: "snapshot", traces: [row("a", T1)], requestedAtSeq: 1 }
    );
    assert.deepEqual(ids(state), ["a"]);
    assert.ok(!needsReconcile(state));
  });

  it("applies agent input that arrived before its turn", () => {
    const state = run(
      { type: "snapshot", traces: [], requestedAtSeq: 0 },
      { type: "agentInput", traceId: "b", agentInput: "hello" },
      { type: "delta", traces: [delta("b", T2)] }
    );
    assert.equal(state.traces[0].agentInput, "hello");
    assert.deepEqual(state.earlyInputs, {});
  });

  it("a covering snapshot ends a turn's live state", () => {
    const live = run(
      { type: "snapshot", traces: [row("a", T1)], requestedAtSeq: 0 },
      { type: "delta", traces: [delta("a", T1)] }
    );
    assert.ok(isLive(live, "a"));
    const settled = applySyncEvent(live, { type: "snapshot", traces: [row("a", T1)], requestedAtSeq: live.seq });
    assert.ok(!isLive(settled, "a"));
  });

  it("a snapshot read before agent input was extracted keeps the input", () => {
    const state = run(
      { type: "snapshot", traces: [row("a", T1)], requestedAtSeq: 0 },
      { type: "agentInput", traceId: "a", agentInput: "hello" },
      { type: "snapshot", traces: [row("a", T1)], requestedAtSeq: 0 }
    );
    assert.equal(state.traces[0].agentInput, "hello");
  });

  it("only a failed first load is an error", () => {
    assert.equal(run({ type: "snapshotFailed", error: "x" }).status, "error");
    const ready = run(
      { type: "snapshot", traces: [row("a", T1)], requestedAtSeq: 0 },
      { type: "snapshotFailed", error: "x" }
    );
    assert.equal(ready.status, "ready");
    assert.deepEqual(ids(ready), ["a"]);
  });
});

describe("replyOf", () => {
  it("maps every reply state", () => {
    assert.deepEqual(replyOf(undefined, false), { status: "loading" });
    assert.deepEqual(replyOf({ kind: "loaded", text: null }, true), { status: "writing" });
    assert.deepEqual(replyOf({ kind: "loaded", text: null }, false), { status: "none" });
    assert.deepEqual(replyOf({ kind: "loaded", text: "hi" }, true), { status: "text", text: "hi" });
    assert.deepEqual(replyOf({ kind: "failed" }, false), { status: "failed" });
  });
});

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const fakeDeps = (overrides: Partial<LiveSessionDeps> = {}) => {
  const calls = { traces: 0 };
  const deps: LiveSessionDeps = {
    loadTraces: async () => {
      calls.traces++;
      return { traces: [row("a", T1)] };
    },
    loadReplies: async (traceIds) => Object.fromEntries(traceIds.map((id) => [id, `reply ${id}`])),
    loadCounts: async () => ({}),
    settleMs: 10,
    ...overrides,
  };
  return { deps, calls };
};

describe("createLiveSessionStore", () => {
  it("refreshes once updates settle and replaces a reply loaded while the turn was live", async () => {
    let refreshed = false;
    const { deps, calls } = fakeDeps({
      loadTraces: async () => {
        refreshed = calls.traces++ > 0;
        return { traces: [row("a", T1)] };
      },
      // Slow, so the refresh lands while this request is in flight; the server only has the reply after the turn ends.
      loadReplies: async (traceIds) => {
        const text = refreshed ? "final" : null;
        await tick(100);
        return Object.fromEntries(traceIds.map((id) => [id, text]));
      },
      settleMs: 200,
    });
    const store = createLiveSessionStore(deps);
    store.getState().start();
    await tick();
    store.getState().receive({ type: "delta", traces: [delta("a", T1)] });
    store.getState().requestDetails(["a"]);
    await tick(700);
    assert.equal(calls.traces, 2);
    assert.deepEqual(store.getState().replies.a, { kind: "loaded", text: "final" });
    store.getState().dispose();
  });

  it("marks a failed reply and retries on request", async () => {
    let fail = true;
    const { deps } = fakeDeps({
      loadReplies: async (traceIds) => (fail ? undefined : Object.fromEntries(traceIds.map((id) => [id, "ok"]))),
    });
    const store = createLiveSessionStore(deps);
    store.getState().start();
    store.getState().requestDetails(["a"]);
    await tick(300);
    assert.deepEqual(store.getState().replies.a, { kind: "failed" });
    fail = false;
    store.getState().retryReply("a");
    await tick(300);
    assert.deepEqual(store.getState().replies.a, { kind: "loaded", text: "ok" });
    store.getState().dispose();
  });

  it("retries a failed refresh so live turns don't stay live", async () => {
    const { deps, calls } = fakeDeps({
      loadTraces: async () => {
        calls.traces++;
        if (calls.traces === 2) return { error: "boom" };
        return { traces: [row("a", T1)] };
      },
    });
    const store = createLiveSessionStore(deps);
    store.getState().start();
    await tick();
    store.getState().receive({ type: "delta", traces: [delta("a", T1)] });
    await tick(150);
    assert.ok(calls.traces >= 3);
    assert.ok(!isLive(store.getState().sync, "a"));
    store.getState().dispose();
  });

  it("survives dispose and start on the same store", async () => {
    const { deps } = fakeDeps();
    const store = createLiveSessionStore(deps);
    store.getState().start();
    store.getState().dispose();
    store.getState().start();
    await tick(50);
    assert.equal(store.getState().sync.status, "ready");
    store.getState().dispose();
  });

  it("never runs two snapshot requests at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { deps } = fakeDeps({
      loadTraces: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await tick(40);
        inFlight--;
        return { traces: [row("a", T1)] };
      },
    });
    const store = createLiveSessionStore(deps);
    store.getState().start();
    store.getState().receive({ type: "delta", traces: [delta("b", T2)] });
    await tick(400);
    assert.equal(maxInFlight, 1);
    assert.deepEqual(ids(store.getState().sync), ["a"]);
    store.getState().dispose();
  });
});
