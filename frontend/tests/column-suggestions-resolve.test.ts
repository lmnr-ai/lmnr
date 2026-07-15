import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ColumnSuggestion,
  resolveColumnSuggestions,
  resolvedRecord,
  type SuggestionRecord,
} from "@/components/ui/columns-menu/suggestions/resolve";

// Pure decision logic for proactive column suggestions (the "Label" column on
// the eval table). This is the single pre-agreed seam: the hook is a thin
// wrapper (localStorage IO + async generate) over these rules.

const mkSuggestion = (id: string, name = id): ColumnSuggestion => ({
  id,
  name,
  dataType: "string",
  generate: async () => ({ sql: "1" }),
});

const label = mkSuggestion("label", "Label");

describe("resolveColumnSuggestions", () => {
  it("marks an unseen, eligible suggestion for generation", () => {
    const res = resolveColumnSuggestions({
      suggestions: [label],
      existingColumnNames: [],
      persisted: {},
      disabled: false,
    });
    assert.deepEqual(
      res.toGenerate.map((s) => s.id),
      ["label"]
    );
    assert.deepEqual(res.toShow, []);
  });

  it("shows a pending suggestion from its cached sql without regenerating", () => {
    const persisted: Record<string, SuggestionRecord> = {
      label: { status: "pending", sql: "simpleJSONExtractString(data, 'id')" },
    };
    const res = resolveColumnSuggestions({
      suggestions: [label],
      existingColumnNames: [],
      persisted,
      disabled: false,
    });
    assert.deepEqual(res.toGenerate, []);
    assert.equal(res.toShow.length, 1);
    assert.equal(res.toShow[0].suggestion.id, "label");
    assert.equal(res.toShow[0].sql, "simpleJSONExtractString(data, 'id')");
  });

  it("skips a resolved suggestion entirely (never nag again)", () => {
    const res = resolveColumnSuggestions({
      suggestions: [label],
      existingColumnNames: [],
      persisted: { label: { status: "resolved" } },
      disabled: false,
    });
    assert.deepEqual(res.toShow, []);
    assert.deepEqual(res.toGenerate, []);
  });

  it("skips when a column of the same name already exists (cross-user / self guard)", () => {
    const res = resolveColumnSuggestions({
      suggestions: [label],
      existingColumnNames: ["Label"],
      persisted: {},
      disabled: false,
    });
    assert.deepEqual(res.toShow, []);
    assert.deepEqual(res.toGenerate, []);
  });

  it("name match is case-insensitive", () => {
    const res = resolveColumnSuggestions({
      suggestions: [label],
      existingColumnNames: ["label"],
      persisted: {},
      disabled: false,
    });
    assert.deepEqual(res.toGenerate, []);
    assert.deepEqual(res.toShow, []);
  });

  it("suppresses everything when disabled (shared eval)", () => {
    const res = resolveColumnSuggestions({
      suggestions: [label],
      existingColumnNames: [],
      persisted: { label: { status: "pending", sql: "1" } },
      disabled: true,
    });
    assert.deepEqual(res.toShow, []);
    assert.deepEqual(res.toGenerate, []);
  });

  it("handles multiple suggestions independently by id", () => {
    const a = mkSuggestion("a", "Alpha");
    const b = mkSuggestion("b", "Beta");
    const c = mkSuggestion("c", "Gamma");
    const res = resolveColumnSuggestions({
      suggestions: [a, b, c],
      existingColumnNames: ["Gamma"], // c is skipped
      persisted: { b: { status: "pending", sql: "b_sql" } }, // b shows, a generates
      disabled: false,
    });
    assert.deepEqual(
      res.toGenerate.map((s) => s.id),
      ["a"]
    );
    assert.deepEqual(
      res.toShow.map((s) => s.suggestion.id),
      ["b"]
    );
  });

  it("keep and discard both produce a resolved record", () => {
    assert.deepEqual(resolvedRecord(), { status: "resolved" });
  });
});
