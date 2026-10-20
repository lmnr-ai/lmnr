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
      "added dup #1",
      "added dup #2",
      "added openai.code",
      "added web_search",
    ]);
  });

  it("matches repeated names by content first, so removing one doesn't shift the rest", () => {
    const a = { name: "dup", description: "a" };
    const b = { name: "dup", description: "b" };
    const { changes, unchanged } = diffTools(tools(a, b), tools(b));
    assert.equal(unchanged, 1);
    assert.deepEqual(
      changes.map((c) => [c.status, c.name, JSON.parse(c.oldText).description]),
      [["removed", "dup", "a"]]
    );
  });

  it("pairs same-named tools by namespace and labels them with it", () => {
    const jira = { name: "search", namespace: "jira" };
    const pr = { name: "search", namespace: "pr" };
    assert.deepEqual(summarize(tools(jira, pr), tools(pr, { ...jira, description: "new" })), {
      changes: ["modified jira.search"],
      unchanged: 1,
    });
  });

  it("treats a tool moving into a namespace as modified", () => {
    assert.deepEqual(summarize(tools({ name: "f" }), tools({ name: "f", namespace: "ns" })).changes, ["modified ns.f"]);
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
