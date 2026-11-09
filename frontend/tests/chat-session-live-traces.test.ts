import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAgentInput,
  applyTraceDeltas,
  mergeFetched,
  replyOf,
} from "@/components/traces/chat-session-view/data/live-traces";
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

describe("mergeFetched", () => {
  it("prefers fetched rows and keeps live turns the fetch doesn't have yet", () => {
    const local = [{ ...row("a", T1), totalTokens: 99 }, row("b", T2), row("c", T2)];
    const merged = mergeFetched(local, [row("a", T1)], new Set(["a", "b"]));
    assert.deepEqual(
      merged.map((t) => [t.id, t.totalTokens]),
      [
        ["a", 10],
        ["b", 10],
      ]
    );
  });
});
