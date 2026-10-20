import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diffTools } from "@/components/settings/agent-versions/tools-diff/utils";

const tools = (...items: object[]) => JSON.stringify(items);
const summarize = (oldText: string, newText: string) => {
  const { changes, unchanged } = diffTools(oldText, newText);
  return { changes: changes.map((c) => `${c.status} ${c.name}`), unchanged };
};

describe("diffTools", () => {
  it("matches tools by name, ignoring their position", () => {
    const a = { name: "a", description: "x" };
    const b = { name: "b", description: "y" };
    assert.deepEqual(summarize(tools(a, b), tools(b, a)), { changes: [], unchanged: 2 });
  });

  it("lists modified, then added, then removed tools, each by name", () => {
    const before = tools({ name: "keep" }, { name: "edit", description: "old" }, { name: "gone" });
    const after = tools({ name: "new" }, { name: "keep" }, { name: "edit", description: "new" });
    assert.deepEqual(summarize(before, after), {
      changes: ["modified edit", "added new", "removed gone"],
      unchanged: 1,
    });
  });

  it("falls back to type then id for built-ins, and keeps repeated names apart", () => {
    const after = tools(
      { type: "web_search" },
      { id: "openai.code" },
      { name: "dup" },
      { name: "dup", description: "2" }
    );
    assert.deepEqual(summarize("", after).changes, [
      "added dup",
      "added dup #2",
      "added openai.code",
      "added web_search",
    ]);
  });

  it("pretty-prints each side and leaves the missing side empty", () => {
    const [change] = diffTools("", tools({ name: "a" })).changes;
    assert.equal(change.oldText, "");
    assert.equal(change.newText, '{\n  "name": "a"\n}');
  });

  it("keeps unparseable text as one tool so nothing is hidden", () => {
    assert.deepEqual(summarize("not json", "not json either").changes, ["modified (unparsed)"]);
  });
});
