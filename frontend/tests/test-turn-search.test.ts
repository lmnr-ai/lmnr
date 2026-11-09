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

const RAW_OFF = { input: false, output: false };
const SECTIONS: Record<"input" | "output", SectionText> = {
  input: { mode: "messages", value: "" },
  output: { mode: "messages", value: "" },
};

const call = (id: string, args: object) => ({
  id,
  type: "function",
  function: { name: "grep", arguments: JSON.stringify(args) },
});
const input = [
  { role: "system", content: "You are a needle finder." },
  { role: "user", content: "find the needle" },
  { role: "assistant", content: null, tool_calls: [call("c1", { pattern: "needle" })] },
  { role: "tool", tool_call_id: "c1", content: "no needle here, needle there" },
];
const output = [{ role: "assistant", content: "Found the needle." }];

const pattern = (term: string) => searchPattern(term)!;

describe("find-matches", () => {
  it("matches tokens across any punctuation, case-insensitively", () => {
    assert.equal(countMatches('"user_id": 42', pattern("user id")), 1);
    assert.deepEqual(findMatchOffsets("Foo foo", pattern("FOO")), [
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ]);
  });

  it("has no pattern for a term without letters or digits", () => {
    assert.equal(searchPattern("  ... "), null);
  });
});

describe("turn search index", () => {
  const allRows = buildRows(buildSpanTurn(input, output), true, RAW_OFF);
  const index = buildTurnSearchIndex(allRows, SECTIONS);

  it("counts matches in every message, folded context included, per row and part", () => {
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
    assert.equal(matches.total, 6);
    // The tool call's arguments are searched as the JSON its editor shows.
    assert.deepEqual(matches.byRow.get("previous-0"), [1]);
  });

  it("locates a global match as a row and a position within it", () => {
    const matches = matchTurn(index, pattern("needle"));
    assert.deepEqual(locateMatch(matches, 0), { key: "system-0", local: 0 });
    assert.deepEqual(locateMatch(matches, 4), { key: "input-0", local: 1 });
    assert.deepEqual(locateMatch(matches, 5), { key: "output-0", local: 0 });
    assert.equal(locateMatch(matches, 6), undefined);
  });

  it("finds nothing without a pattern", () => {
    assert.equal(matchTurn(index, null).total, 0);
  });

  it("searches a raw section's payload in the section header and skips custom templates", () => {
    const raw = { input: true, output: false };
    const rows = buildRows(buildSpanTurn(input, output), true, raw);
    const value = JSON.stringify(input);
    const yaml = buildTurnSearchIndex(rows, { ...SECTIONS, input: { mode: "yaml", value } });
    assert.equal(matchTurn(yaml, pattern("needle")).byRow.get("section-input")?.[0], 5);

    const custom = buildTurnSearchIndex(rows, { ...SECTIONS, input: { mode: "custom", value } });
    assert.equal(matchTurn(custom, pattern("needle")).byRow.has("section-input"), false);
  });

  it("searches provider-rendered messages by their text, not their media or structure", () => {
    const withImage = [
      {
        role: "user",
        content: [
          { type: "text", text: "what is in this image?" },
          { type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } },
        ],
      },
    ];
    const rows = buildRows(buildSpanTurn(withImage, null), true, RAW_OFF);
    const matches = matchTurn(buildTurnSearchIndex(rows, SECTIONS), pattern("image"));
    assert.equal(matches.total, 1);
    assert.equal(matchTurn(buildTurnSearchIndex(rows, SECTIONS), pattern("text")).total, 0);
  });

  it("counts a long conversation without mounting anything", () => {
    const long = Array.from({ length: 2000 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `message ${i} ${"lorem ipsum dolor sit amet ".repeat(80)}${i % 100 === 0 ? "needle" : ""}`,
    }));
    const rows = buildRows(buildSpanTurn(long, null), true, RAW_OFF);
    const longIndex = buildTurnSearchIndex(rows, SECTIONS);
    const matches = matchTurn(longIndex, pattern("needle"));
    assert.equal(matches.total, 20);
    assert.equal(matchTurn(longIndex, pattern("dolor")).total, 2000 * 80);
  });
});
