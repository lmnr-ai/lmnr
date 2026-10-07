import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyTracePartial, mergeTraceDelta, realtimeTraceToRow } from "@/lib/traces/realtime";
import { type RealtimeTracePayload, type SpanType, type TraceRow } from "@/lib/traces/types";

const baseDelta = (overrides: Partial<RealtimeTracePayload> = {}): RealtimeTracePayload => ({
  id: "t1",
  startTime: "2026-01-01T00:00:10.000Z",
  endTime: "2026-01-01T00:00:20.000Z",
  sessionId: null,
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
  cacheReadInputTokens: 2,
  cacheCreationInputTokens: 1,
  reasoningTokens: 3,
  inputCost: 0.1,
  outputCost: 0.2,
  totalCost: 0.3,
  metadata: null,
  topSpanId: null,
  traceType: "DEFAULT",
  topSpanName: null,
  topSpanType: null,
  status: null,
  userId: null,
  tags: [],
  ...overrides,
});

describe("realtimeTraceToRow (delta seed)", () => {
  it("seeds a row from a payload with no agentInput stand-in", () => {
    const row = realtimeTraceToRow(baseDelta({ topSpanId: "s1", topSpanType: "LLM", tags: ["a"] }));
    assert.equal(row.id, "t1");
    assert.equal(row.totalTokens, 15);
    assert.equal(row.topSpanId, "s1");
    assert.equal(row.topSpanType, "LLM" as SpanType);
    assert.deepEqual(row.spanTags, ["a"]);
    assert.deepEqual(row.traceTags, []);
    assert.equal(row.agentInput, undefined);
  });
});

describe("mergeTraceDelta accumulation", () => {
  it("sums tokens and costs across two deltas", () => {
    const seed = realtimeTraceToRow(baseDelta());
    const merged = mergeTraceDelta(
      seed,
      baseDelta({ inputTokens: 4, outputTokens: 6, totalTokens: 10, totalCost: 0.7 })
    );
    assert.equal(merged.inputTokens, 14);
    assert.equal(merged.outputTokens, 11);
    assert.equal(merged.totalTokens, 25);
    assert.equal(merged.cacheReadInputTokens, 4);
    assert.equal(merged.reasoningTokens, 6);
    assert.ok(Math.abs(merged.totalCost - 1.0) < 1e-9);
  });

  it("takes min startTime and max endTime", () => {
    const seed = realtimeTraceToRow(baseDelta());
    const merged = mergeTraceDelta(
      seed,
      baseDelta({ startTime: "2026-01-01T00:00:05.000Z", endTime: "2026-01-01T00:00:30.000Z" })
    );
    assert.equal(merged.startTime, "2026-01-01T00:00:05.000Z");
    assert.equal(merged.endTime, "2026-01-01T00:00:30.000Z");
  });

  it("error-wins: once errored, a later success delta keeps error", () => {
    const seed = realtimeTraceToRow(baseDelta({ status: "error" }));
    const merged = mergeTraceDelta(seed, baseDelta({ status: "success" }));
    assert.equal(merged.status, "error");
  });

  it("unions span tags", () => {
    const seed = realtimeTraceToRow(baseDelta({ tags: ["a", "b"] }));
    const merged = mergeTraceDelta(seed, baseDelta({ tags: ["b", "c"] }));
    assert.deepEqual([...merged.spanTags].sort(), ["a", "b", "c"]);
  });

  it("overwrites top-span fields only when the batch carries them", () => {
    const seed = realtimeTraceToRow(baseDelta({ topSpanId: "s1", topSpanName: "root", topSpanType: "LLM" }));
    // A later batch with no root span (null top-span fields) must not clobber.
    const merged = mergeTraceDelta(seed, baseDelta({ topSpanId: null, topSpanName: null, topSpanType: null }));
    assert.equal(merged.topSpanId, "s1");
    assert.equal(merged.topSpanName, "root");
    assert.equal(merged.topSpanType, "LLM" as SpanType);
  });

  it("preserves fetched traceTags and agentInput across a delta", () => {
    const fetched: TraceRow = { ...realtimeTraceToRow(baseDelta()), traceTags: ["prod"], agentInput: "hello" };
    const merged = mergeTraceDelta(fetched, baseDelta({ inputTokens: 1 }));
    assert.deepEqual(merged.traceTags, ["prod"]);
    assert.equal(merged.agentInput, "hello");
  });

  it("merges metadata maps with delta keys winning", () => {
    const seed = realtimeTraceToRow(baseDelta({ metadata: { a: "1", b: "2" } }));
    const merged = mergeTraceDelta(seed, baseDelta({ metadata: { b: "3", c: "4" } }));
    assert.deepEqual(merged.metadata, { a: "1", b: "3", c: "4" });
  });
});

describe("applyTracePartial (agentInput fragment)", () => {
  it("sets a string agentInput verbatim", () => {
    const row = realtimeTraceToRow(baseDelta());
    assert.equal(applyTracePartial(row, { agentInput: "the task" }).agentInput, "the task");
  });

  it("stringifies a non-string agentInput", () => {
    const row = realtimeTraceToRow(baseDelta());
    assert.equal(applyTracePartial(row, { agentInput: { role: "user" } }).agentInput, JSON.stringify({ role: "user" }));
  });

  it("leaves the row untouched for an empty fragment", () => {
    const row = { ...realtimeTraceToRow(baseDelta()), agentInput: "keep" };
    assert.equal(applyTracePartial(row, {}).agentInput, "keep");
  });
});
