import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countMatches, findMatchOffsets, searchPattern } from "@/components/traces/span-view/searchable/find-matches";
import { buildRows } from "@/components/traces/span-view/span-turn/build-rows";
import {
  buildTurnSearchIndex,
  locateMatch,
  matchTurn,
  type SectionText,
} from "@/components/traces/span-view/span-turn/search-index";
import { buildSpanTurn } from "@/lib/spans/turn";

const SECTIONS: Record<"input" | "output", SectionText> = {
  input: { mode: "messages", value: "" },
  output: { mode: "messages", value: "" },
};
const input = [
  { role: "system", content: "You are a needle finder." },
  { role: "user", content: "find the needle" },
  {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "c1", type: "function", function: { name: "grep", arguments: '{"pattern":"needle"}' } }],
  },
  { role: "tool", tool_call_id: "c1", content: "no needle here, needle there" },
];
const output = [{ role: "assistant", content: "Found the needle." }];

const pattern = (term: string) => searchPattern(term)!;
const indexOf = (messages: unknown, raw = { input: false, output: false }, sections = SECTIONS) =>
  buildTurnSearchIndex(buildRows(buildSpanTurn(messages, output), true, raw), sections);

describe("turn search", () => {
  it("matches tokens across punctuation, case-insensitively", () => {
    assert.equal(countMatches('"user_id": 42', pattern("user id")), 1);
    assert.deepEqual(findMatchOffsets("Foo foo", pattern("FOO")), [
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ]);
    assert.equal(searchPattern("  ... "), null);
  });

  it("counts every message, folded context and tool args included, and locates global matches", () => {
    const index = indexOf(input);
    const matches = matchTurn(index, pattern("needle"));
    assert.deepEqual(
      matches.order.map(({ key, count }) => [key, count]),
      [
        ["system-0", 1],
        ["task-0", 1],
        ["previous-0", 1],
        ["input-0", 2],
        ["output-0", 1],
      ]
    );
    assert.deepEqual(locateMatch(matches, 4), { key: "input-0", local: 1 });
    assert.equal(locateMatch(matches, 6), undefined);
    assert.equal(matchTurn(index, null).total, 0);
  });

  it("searches a raw section's payload and skips custom templates", () => {
    const raw = { input: true, output: false };
    const value = JSON.stringify(input);
    const yaml = indexOf(input, raw, { ...SECTIONS, input: { mode: "yaml", value } });
    assert.equal(matchTurn(yaml, pattern("needle")).byRow.get("section-input")?.[0], 5);
    const custom = indexOf(input, raw, { ...SECTIONS, input: { mode: "custom", value } });
    assert.equal(matchTurn(custom, pattern("needle")).byRow.has("section-input"), false);
  });

  it("searches provider-rendered messages by their text, not media or structure", () => {
    const content = [
      { type: "text", text: "what is in this image?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } },
    ];
    const index = indexOf([{ role: "user", content }]);
    assert.equal(matchTurn(index, pattern("image")).total, 1);
    assert.equal(matchTurn(index, pattern("text")).total, 0);
  });
});
