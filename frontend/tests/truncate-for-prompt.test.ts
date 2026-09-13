import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { truncateForPrompt } from "@/lib/utils";

describe("truncateForPrompt", () => {
  it("parses a JSON string column before truncating", () => {
    const out = truncateForPrompt(JSON.stringify({ label: "x", n: 1 }));
    assert.deepEqual(out, { label: "x", n: 1 });
  });

  it("returns non-JSON strings truncated to the string cap", () => {
    const out = truncateForPrompt("y".repeat(100)) as string;
    assert.equal(out.length, 65); // 64 chars + "…"
    assert.ok(out.endsWith("…"));
  });

  it("caps arrays and leaves an omitted-count marker", () => {
    const arr = Array.from({ length: 25 }, (_, i) => i);
    const out = truncateForPrompt(JSON.stringify(arr)) as unknown[];
    assert.equal(out.length, 11); // 10 items + marker
    assert.equal(out[10], "…15 more items");
  });

  it("caps long string leaves inside a parsed object", () => {
    const out = truncateForPrompt(JSON.stringify({ big: "z".repeat(200) })) as { big: string };
    assert.equal(out.big.length, 65);
    assert.ok(out.big.endsWith("…"));
  });

  it("collapses anything beyond the depth cap to …", () => {
    // 9 levels deep — the 8-level cap should replace the deepest with "…".
    let nested: unknown = "leaf";
    for (let i = 0; i < 9; i++) nested = { child: nested };
    const out = truncateForPrompt(nested) as Record<string, unknown>;
    let cur: unknown = out;
    for (let i = 0; i < 8; i++) cur = (cur as Record<string, unknown>).child;
    assert.equal(cur, "…");
  });

  it("passes primitives through unchanged", () => {
    assert.equal(truncateForPrompt(42), 42);
    assert.equal(truncateForPrompt(true), true);
    assert.equal(truncateForPrompt(null), null);
  });
});
