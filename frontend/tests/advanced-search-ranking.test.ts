import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildValueSuggestions, matchScore, rankFilters, rankValues } from "@/components/common/advanced-search/utils";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

const filters: ColumnFilter[] = [
  { name: "Model", key: "model", dataType: "string" },
  { name: "Top span name", key: "top_span_name", dataType: "string" },
  { name: "Status", key: "status", dataType: "enum", options: [{ value: "error", label: "Error" }] },
];

describe("matchScore", () => {
  it("orders exact > prefix > word-prefix > substring > subsequence", () => {
    const exact = matchScore("gpt", "gpt")!;
    const prefix = matchScore("gpt-4o", "gpt")!;
    const wordPrefix = matchScore("openai/gpt-4o", "gpt")!;
    const substring = matchScore("mygptmodel", "gpt")!;
    const subsequence = matchScore("g_p_t", "gpt")!;

    assert.ok(exact > prefix, "exact beats prefix");
    assert.ok(prefix > wordPrefix, "prefix beats word prefix");
    assert.ok(wordPrefix > substring, "word prefix beats plain substring");
    assert.ok(substring > subsequence, "substring beats subsequence");
  });

  it("breaks ties toward shorter candidates", () => {
    assert.ok(matchScore("gpt-4o", "gpt")! > matchScore("gpt-4o-mini-2024-07-18", "gpt")!);
  });

  it("returns null when nothing matches", () => {
    assert.equal(matchScore("claude", "gpt"), null);
  });
});

describe("rankFilters", () => {
  it("matches on either the display name or the raw key, best first", () => {
    assert.deepEqual(
      rankFilters(filters, "span").map((f) => f.key),
      ["top_span_name"]
    );
    assert.deepEqual(
      rankFilters(filters, "model").map((f) => f.key),
      ["model"]
    );
  });

  it("drops non-matching columns", () => {
    assert.deepEqual(rankFilters(filters, "zzz"), []);
  });
});

describe("rankValues", () => {
  it("ranks prefix hits above substring hits and honours the limit", () => {
    const values = ["anthropic/claude-opus", "gpt-4o", "gpt-4o-mini", "openai/gpt-4.1"];
    assert.deepEqual(rankValues(values, "gpt"), ["gpt-4o", "gpt-4o-mini", "openai/gpt-4.1"]);
    assert.deepEqual(rankValues(values, "gpt", 1), ["gpt-4o"]);
  });
});

describe("buildValueSuggestions", () => {
  const autocompleteData = new Map<string, string[]>([
    ["model", ["gpt-4o", "gpt-4o-mini", "claude-opus"]],
    ["top_span_name", ["generate_answer", "rerank"]],
  ]);

  it("surfaces a field's values when the FIELD name matches but the values don't", () => {
    const suggestions = buildValueSuggestions("model", filters, autocompleteData);
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.every((s) => s.field === "model"));
  });

  it("caps how many values a single field contributes", () => {
    const many = new Map<string, string[]>([["model", Array.from({ length: 50 }, (_, i) => `gpt-${i}`)]]);
    assert.equal(buildValueSuggestions("gpt", filters, many).length, 5);
  });

  it("includes enum options matched by label as well as value", () => {
    const suggestions = buildValueSuggestions("error", filters, new Map());
    assert.deepEqual(
      suggestions.map((s) => [s.field, s.value]),
      [["status", "error"]]
    );
  });
});
