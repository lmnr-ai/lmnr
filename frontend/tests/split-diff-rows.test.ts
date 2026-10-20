import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collapseDiffRows, computeSplitRows, type SplitRow, type SplitSide } from "@/components/ui/diff/diff";

const text = (side?: SplitSide) => side?.segments.map((s) => s.text).join("");
const summarize = (rows: SplitRow[]) =>
  rows.map((row) =>
    row.type === "gap"
      ? `gap ${row.count}`
      : `${row.left?.num ?? "-"}:${text(row.left) ?? ""} | ${row.right?.num ?? "-"}:${text(row.right) ?? ""}`
  );

describe("computeSplitRows", () => {
  it("pairs changed lines and keeps both sides' line numbers aligned", () => {
    const rows = computeSplitRows("a\nb\nc\n", "a\nB\nc\nd\n");
    assert.deepEqual(summarize(rows), ["1:a | 1:a", "2:b | 2:B", "3:c | 3:c", "-: | 4:d"]);
    assert.deepEqual(
      rows.map((r) => r.type),
      ["equal", "change", "equal", "change"]
    );
  });

  it("leaves the new side empty for unpaired removals", () => {
    const rows = computeSplitRows("a\nb\nc\n", "a\n");
    assert.deepEqual(summarize(rows), ["1:a | 1:a", "2:b | -:", "3:c | -:"]);
  });

  it("word-highlights only the changed words of a paired line", () => {
    const [row] = computeSplitRows("answer politely\n", "answer briefly\n");
    assert.equal(row.type, "change");
    assert.ok(row.type === "change" && row.left && row.right);
    assert.deepEqual(
      row.right.segments.filter((s) => s.highlight).map((s) => s.text),
      ["briefly"]
    );
  });

  it("collapses long unchanged runs around changes", () => {
    const old = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const rows = collapseDiffRows(computeSplitRows(old, old.replace("line 10", "line ten")));
    assert.deepEqual(
      rows.map((r) => (r.type === "gap" ? `gap ${r.count}` : r.type)),
      ["gap 7", "equal", "equal", "equal", "change", "equal", "equal", "equal", "gap 6"]
    );
  });
});
