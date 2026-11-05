import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConversationRows, buildFocusedRows } from "@/components/traces/span-view/span-turn/build-rows";
import {
  anchorHash,
  findAnchorRow,
  isFoldedAnchor,
  parseAnchorHash,
} from "@/components/traces/span-view/span-turn/message-anchor";
import { buildSpanTurn } from "@/lib/spans/turn";

const call = (id: string) => ({ id, type: "function", function: { name: "grep", arguments: "{}" } });
const input = [
  { role: "system", content: "sys" },
  { role: "user", content: "task" },
  { role: "assistant", content: null, tool_calls: [call("c1"), call("c2")] },
  { role: "tool", tool_call_id: "c1", content: "r1" },
  { role: "tool", tool_call_id: "c2", content: "r2" },
];
const output = [{ role: "assistant", content: "done" }];
const turn = buildSpanTurn(input, output);

const OPTIONS = { batchResults: false, newInputStyle: "divider" as const, raw: { input: false, output: false } };
const anchorsOf = (rows: ReturnType<typeof buildConversationRows>) =>
  rows.flatMap((row) => (row.kind === "message" ? [anchorHash(row.anchor)] : []));

describe("message anchors", () => {
  it("round-trips the hash and rejects anything else", () => {
    assert.deepEqual(parseAnchorHash("#input-12"), { section: "input", index: 12 });
    assert.equal(anchorHash({ section: "output", index: 0 }), "#output-0");
    assert.equal(parseAnchorHash("#input-"), undefined);
    assert.equal(parseAnchorHash("#settings"), undefined);
  });

  it("addresses rows by their index in the payload, across the turn split", () => {
    const rows = buildConversationRows(turn, true, "compact", OPTIONS);
    assert.deepEqual(anchorsOf(rows), ["#input-0", "#input-1", "#input-2", "#input-3", "#input-4", "#output-0"]);
  });

  it("folds only messages before the new input", () => {
    assert.equal(isFoldedAnchor(turn, { section: "input", index: 2 }), true);
    assert.equal(isFoldedAnchor(turn, { section: "input", index: 3 }), false);
    assert.equal(isFoldedAnchor(turn, { section: "output", index: 0 }), false);
  });

  it("resolves a message inside a batched card to that card", () => {
    const rows = buildFocusedRows(turn, false, { input: false, output: false });
    const batch = findAnchorRow(rows, { section: "input", index: 4 });
    assert.equal(rows[batch].kind === "message" && anchorHash(rows[batch].anchor), "#input-3");
    assert.equal(findAnchorRow(rows, { section: "output", index: 0 }), rows.length - 1);
    // Folded and not opened: nothing to scroll to.
    assert.equal(findAnchorRow(rows, { section: "input", index: 0 }), -1);
  });
});
