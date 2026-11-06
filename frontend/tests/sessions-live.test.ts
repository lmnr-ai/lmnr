import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAgentInput,
  applyTraceDelta,
  type LiveSessions,
  mergeRefreshedPage,
} from "@/components/traces/sessions-table/live-sessions";
import { type RealtimeTracePayload, type SessionRow } from "@/lib/traces/types";

const delta = (id: string, startTime: string, endTime: string, totalTokens = 10): RealtimeTracePayload => ({
  id,
  startTime,
  endTime,
  sessionId: "s",
  inputTokens: 0,
  outputTokens: 0,
  totalTokens,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  reasoningTokens: 0,
  inputCost: 0,
  outputCost: 0,
  totalCost: 0.5,
  metadata: null,
  topSpanId: null,
  traceType: "DEFAULT",
  topSpanName: null,
  topSpanType: null,
  status: null,
  userId: null,
  tags: [],
});

const empty: LiveSessions = { rows: [], traces: {}, pendingInputs: {} };
const at = (s: number) => new Date(Date.UTC(2026, 10, 6, 10, 0, s)).toISOString();

describe("live sessions", () => {
  it("a trace's first batch adds a new session on top; later batches accumulate without recounting", () => {
    const old = { ...empty, rows: [{ sessionId: "old", endTime: at(0) } as SessionRow] };
    const state = [delta("t1", at(10), at(20)), delta("t1", at(25), at(40))].reduce(applyTraceDelta, old);
    const row = state.rows[0];
    assert.equal(row.sessionId, "s");
    assert.equal(state.rows[1].sessionId, "old");
    assert.equal(row.traceCount, 1);
    assert.equal(row.totalTokens, 20);
    assert.equal(row.totalCost, 1);
    assert.equal(row.startTime, at(10));
    assert.equal(row.endTime, at(40));
    assert.equal(row.duration, 30);
  });

  it("duration sums per-trace windows, not the session span", () => {
    const state = [delta("t1", at(0), at(10)), delta("t2", at(20), at(25))].reduce(applyTraceDelta, empty);
    assert.equal(state.rows[0].traceCount, 2);
    assert.equal(state.rows[0].duration, 15);
  });

  it("agent input that beats its trace fills the first input when the trace lands", () => {
    const early = applyAgentInput(empty, "t1", { text: "hi" });
    const state = applyTraceDelta(early, delta("t1", at(0), at(1)));
    assert.equal(state.rows[0].firstInput, '{"text":"hi"}');
    assert.deepEqual(state.pendingInputs, {});
    // A later trace never replaces the session's first input.
    const later = applyAgentInput(applyTraceDelta(state, delta("t2", at(5), at(6))), "t2", "second");
    assert.equal(later.rows[0].firstInput, '{"text":"hi"}');
  });

  it("a refreshed row replaces a live one only once the server has caught up", () => {
    const live = [{ sessionId: "s", endTime: at(40), traceCount: 2 } as SessionRow];
    const lagging = mergeRefreshedPage(live, [{ sessionId: "s", endTime: at(20), traceCount: 1 } as SessionRow]);
    assert.equal(lagging[0].traceCount, 2);
    const caughtUp = mergeRefreshedPage(live, [{ sessionId: "s", endTime: at(40), traceCount: 1 } as SessionRow]);
    assert.equal(caughtUp[0].traceCount, 1);
  });
});
