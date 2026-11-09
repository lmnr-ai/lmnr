import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTracesSlice, type TracesSlice } from "@/components/traces/chat-session-view/store/traces";
import { type TraceRow } from "@/lib/traces/types";

const row = (id: string, startTime: string) => ({ id, startTime, endTime: startTime }) as TraceRow;

const slice = () => {
  let state: TracesSlice;
  const set = (partial: Partial<TracesSlice>) => (state = { ...state, ...partial });
  state = createTracesSlice({ loadReply: async () => null, loadCounts: async () => undefined })(set, () => state);
  return () => state;
};

describe("chat session traces slice", () => {
  it("a settled fetch ends live turns it has, and keeps the ones ClickHouse hasn't written yet", () => {
    const get = slice();
    get().receiveTraces([row("a", "2026-01-01T00:00:00Z")], true, []);
    get().patchTraces(
      (rows) => [...rows, row("b", "2026-01-01T00:01:00Z"), row("c", "2026-01-01T00:02:00Z")],
      ["a", "b", "c"]
    );

    const missing = get().receiveTraces([row("a", "2026-01-01T00:00:00Z"), row("b", "2026-01-01T00:01:00Z")], true, []);

    assert.equal(missing, 1);
    assert.deepEqual([...get().live], ["c"]);
    assert.deepEqual(
      get().traces.map((t) => t.id),
      ["a", "b", "c"]
    );
  });

  it("an unsettled fetch keeps every live turn and replays the patches it may predate", () => {
    const get = slice();
    const patch = (rows: TraceRow[]) => [...rows, row("b", "2026-01-01T00:01:00Z")];
    get().patchTraces(patch, ["b"]);

    get().receiveTraces([row("a", "2026-01-01T00:00:00Z")], false, [patch]);

    assert.deepEqual([...get().live], ["b"]);
    assert.deepEqual(
      get().traces.map((t) => t.id),
      ["a", "b"]
    );
  });

  it("keeps a live input that beat its turn, and through fetches until the server has it", () => {
    const get = slice();
    get().receiveAgentInput("a", "hi");
    get().patchTraces((rows) => [...rows, row("a", "2026-01-01T00:00:00Z")], ["a"]);
    assert.equal(get().traces[0].agentInput, "hi");

    get().receiveTraces([row("a", "2026-01-01T00:00:00Z")], true, []);
    assert.equal(get().traces[0].agentInput, "hi");

    get().receiveTraces([{ ...row("a", "2026-01-01T00:00:00Z"), agentInput: "server" }], true, []);
    assert.equal(get().traces[0].agentInput, "server");
    assert.deepEqual(get().liveInputs, {});
  });
});
