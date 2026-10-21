import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diffTools } from "@/components/settings/agent-versions/tools-diff/utils";

/** Version text as app-server `tool_text::render` writes it: a name line, then leaf lines. */
const tool = (name: string, ...leaves: string[]) => [name, ...leaves.map((leaf) => `${name}.${leaf}`)];
const tools = (...items: string[][]) => items.flat().join("\n");
const summarize = (oldText: string, newText: string) => {
  const { changes, unchanged } = diffTools(oldText, newText);
  return { changes: changes.map((c) => `${c.status} ${c.name}`), unchanged };
};

describe("diffTools", () => {
  it("matches tools by name, ignoring their position", () => {
    const a = tool("a", "description: x");
    const b = tool("b", "description: y");
    assert.deepEqual(summarize(tools(a, b), tools(b, a)), { changes: [], unchanged: 2 });
  });

  it("lists modified, then added, then removed tools, each by name", () => {
    const before = tools(tool("keep"), tool("edit", "description: old"), tool("gone"));
    const after = tools(tool("new"), tool("keep"), tool("edit", "description: new"));
    assert.deepEqual(summarize(before, after), {
      changes: ["modified edit", "added new", "removed gone"],
      unchanged: 1,
    });
  });

  it("keeps dotted names whole and repeated names apart", () => {
    const after = tools(
      tool("dup"),
      tool("dup", "description: 2"),
      tool("openai.code", "type: code_interpreter"),
      tool("web_search", "type: web_search")
    );
    assert.deepEqual(summarize("", after).changes, [
      "added dup #1",
      "added dup #2",
      "added openai.code",
      "added web_search",
    ]);
  });

  it("matches repeated names by content first, so removing one doesn't shift the rest", () => {
    const a = tool("dup", "description: a");
    const b = tool("dup", "description: b");
    const { changes, unchanged } = diffTools(tools(a, b), tools(b));
    assert.equal(unchanged, 1);
    assert.deepEqual(
      changes.map((c) => [c.status, c.name, c.oldText]),
      [["removed", "dup", "dup\ndup.description: a"]]
    );
  });

  it("pairs same-named tools by namespace and labels them with it", () => {
    const jira = tool("search", "namespace: jira");
    const pr = tool("search", "namespace: pr");
    const jiraEdited = tool("search", "description: new", "namespace: jira");
    assert.deepEqual(summarize(tools(jira, pr), tools(jiraEdited, pr)), {
      changes: ["modified jira.search"],
      unchanged: 1,
    });
  });

  it("treats a tool moving into a namespace as modified", () => {
    assert.deepEqual(summarize(tools(tool("f")), tools(tool("f", "namespace: ns"))).changes, ["modified ns.f"]);
  });

  it("gives each side the tool's own lines and leaves the missing side empty", () => {
    const text = tools(tool("a", "description: Get it.", 'input_schema.required[] = "q"'), tool("b"));
    const [change] = diffTools("", text).changes;
    assert.equal(change.oldText, "");
    assert.equal(change.newText, 'a\na.description: Get it.\na.input_schema.required[] = "q"');
    assert.equal(change.additions, 3);
  });

  it("keeps leaf lines whose header dropped out under their first path segment", () => {
    assert.deepEqual(summarize("", "orphan.description: x").changes, ["added orphan"]);
  });
});
