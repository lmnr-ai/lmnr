import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIdBatcher } from "@/components/traces/chat-session-view/data/id-batcher";
import { applyAgentInput, applyTraceDeltas, replyOf } from "@/components/traces/chat-session-view/data/live-traces";
import { type RealtimeTracePayload, type TraceRow } from "@/lib/traces/types";

const T1 = "2026-11-06T10:00:00.000Z";
const T2 = "2026-11-06T10:05:00.000Z";

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

describe("applyTraceDeltas", () => {
  it("merges known turns and adds new ones in start-time order", () => {
    const rows = applyTraceDeltas([row("b", T2)], [delta("b", T2), delta("a", T1)]);
    assert.deepEqual(
      rows.map((t) => t.id),
      ["a", "b"]
    );
    assert.equal(rows[1].totalTokens, 11);
  });
});

describe("applyAgentInput", () => {
  it("fills a known turn and ignores unknown ones", () => {
    const rows = [row("a", T1)];
    assert.equal(applyAgentInput(rows, "a", "hi")[0].agentInput, "hi");
    assert.equal(applyAgentInput(rows, "x", "hi"), rows);
  });
});

describe("replyOf", () => {
  it("maps live, failed, loading, empty and text replies", () => {
    assert.deepEqual(replyOf(true, "hi", false), { status: "writing" });
    assert.deepEqual(replyOf(false, undefined, true), { status: "failed" });
    assert.deepEqual(replyOf(false, undefined, false), { status: "loading" });
    assert.deepEqual(replyOf(false, null, false), { status: "none" });
    assert.deepEqual(replyOf(false, "hi", false), { status: "text", text: "hi" });
  });
});

describe("createIdBatcher", () => {
  it("loads ids asked for together in one chunked request each", async () => {
    const calls: string[][] = [];
    const load = createIdBatcher(
      async (ids) => {
        calls.push(ids);
        return Object.fromEntries(ids.filter((id) => id !== "c").map((id) => [id, id.toUpperCase()]));
      },
      { delayMs: 0, chunkSize: 2 }
    );
    const results = await Promise.all([load("a"), load("b"), load("c"), load("a")]);
    assert.deepEqual(results, ["A", "B", undefined, "A"]);
    assert.deepEqual(calls, [["a", "b"], ["c"]]);
  });

  it("rejects every id in a failed chunk", async () => {
    const load = createIdBatcher(async () => Promise.reject(new Error("boom")), { delayMs: 0 });
    await assert.rejects(load("a"), /boom/);
  });
});
