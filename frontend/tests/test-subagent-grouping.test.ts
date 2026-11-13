import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { buildTranscriptListEntries, computeSubagentGroups } from "@/components/traces/trace-view/store/utils";

type FixtureSpanType = "LLM" | "CACHED" | "TOOL" | "DEFAULT";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface SpanInput {
  id: string;
  parentId?: string;
  type: FixtureSpanType;
  /** Defaults to the span id. */
  name?: string;
}

const T0 = new Date("2025-01-01T00:00:00.000Z").getTime();
const toTime = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1000).toISOString();

// Start times follow document order, so list fixtures in the order spans start.
const buildSpans = (inputs: SpanInput[]): TraceViewSpan[] =>
  inputs.map((input, i) => ({
    spanId: input.id,
    parentSpanId: input.parentId,
    traceId: "trace-1",
    name: input.name ?? input.id,
    startTime: toTime(i),
    endTime: toTime(i + 1),
    attributes: {},
    spanType: input.type as TraceViewSpan["spanType"],
    path: input.name ?? input.id,
    events: [],
    collapsed: false,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
  }));

const groupsByTool = (spans: TraceViewSpan[]): Record<string, string[]> =>
  Object.fromEntries(computeSubagentGroups(spans).map((g) => [g.toolSpanId, g.spanIds]));

// ---------------------------------------------------------------------------
// computeSubagentGroups
// ---------------------------------------------------------------------------

describe("computeSubagentGroups", () => {
  it("returns no groups when no tool span has LLM descendants", () => {
    const spans = buildSpans([
      { id: "root", type: "DEFAULT" },
      { id: "llm_1", parentId: "root", type: "LLM" },
      { id: "search", parentId: "root", type: "TOOL" },
      { id: "http", parentId: "search", type: "DEFAULT" },
      { id: "llm_2", parentId: "root", type: "LLM" },
    ]);
    assert.deepStrictEqual(computeSubagentGroups(spans), []);
  });

  it("groups everything under a Claude Agent SDK `Agent` tool span, excluding the tool itself", () => {
    // query (DEFAULT) > Agent (TOOL) > anthropic.messages (LLM) + the subagent's own tools.
    const spans = buildSpans([
      { id: "query", type: "DEFAULT" },
      { id: "main_1", parentId: "query", type: "LLM", name: "anthropic.messages" },
      { id: "agent", parentId: "query", type: "TOOL", name: "Agent" },
      { id: "sub_1", parentId: "agent", type: "LLM", name: "anthropic.messages" },
      { id: "sub_read", parentId: "agent", type: "TOOL", name: "Read" },
      { id: "sub_2", parentId: "agent", type: "LLM", name: "anthropic.messages" },
      { id: "main_2", parentId: "query", type: "LLM", name: "anthropic.messages" },
    ]);

    assert.deepStrictEqual(computeSubagentGroups(spans), [
      { groupId: "group-agent", toolSpanId: "agent", spanIds: ["sub_1", "sub_read", "sub_2"] },
    ]);
  });

  it("splits two invocations of the same subagent tool into separate groups", () => {
    const spans = buildSpans([
      { id: "query", type: "DEFAULT" },
      { id: "main_1", parentId: "query", type: "LLM" },
      { id: "agent_a", parentId: "query", type: "TOOL", name: "Agent" },
      { id: "agent_b", parentId: "query", type: "TOOL", name: "Agent" },
      { id: "a_llm", parentId: "agent_a", type: "LLM" },
      { id: "b_llm", parentId: "agent_b", type: "LLM" },
      { id: "a_tool", parentId: "agent_a", type: "TOOL" },
      { id: "b_tool", parentId: "agent_b", type: "TOOL" },
    ]);

    assert.deepStrictEqual(groupsByTool(spans), {
      agent_a: ["a_llm", "a_tool"],
      agent_b: ["b_llm", "b_tool"],
    });
  });

  it("includes intermediate DEFAULT spans of an OpenAI Agents `asTool` run", () => {
    // Main > agents.turn > tool (TOOL) > agents.task > Sub > agents.turn > agents.response (LLM).
    const spans = buildSpans([
      { id: "main", type: "DEFAULT" },
      { id: "turn", parentId: "main", type: "DEFAULT" },
      { id: "main_llm", parentId: "turn", type: "LLM" },
      { id: "tool", parentId: "turn", type: "TOOL", name: "researcher" },
      { id: "task", parentId: "tool", type: "DEFAULT" },
      { id: "sub", parentId: "task", type: "DEFAULT" },
      { id: "sub_turn", parentId: "sub", type: "DEFAULT" },
      { id: "sub_llm", parentId: "sub_turn", type: "LLM" },
      { id: "sub_fn", parentId: "sub_turn", type: "TOOL" },
    ]);

    assert.deepStrictEqual(groupsByTool(spans), {
      tool: ["task", "sub", "sub_turn", "sub_llm", "sub_fn"],
    });
  });

  it("finds a subagent tool nested under the parent's LLM-typed step span (Mastra)", () => {
    // agent run > step: 0 (LLM) > tool: 'agent-researcher' (TOOL) > agent run > step: 0 (LLM).
    const spans = buildSpans([
      { id: "run", type: "DEFAULT" },
      { id: "step", parentId: "run", type: "LLM" },
      { id: "tool", parentId: "step", type: "TOOL", name: "agent-researcher" },
      { id: "sub_run", parentId: "tool", type: "DEFAULT" },
      { id: "sub_step", parentId: "sub_run", type: "LLM" },
    ]);

    assert.deepStrictEqual(groupsByTool(spans), { tool: ["sub_run", "sub_step"] });
  });

  it("counts CACHED spans as LLM calls", () => {
    const spans = buildSpans([
      { id: "root", type: "DEFAULT" },
      { id: "main_llm", parentId: "root", type: "LLM" },
      { id: "tool", parentId: "root", type: "TOOL" },
      { id: "cached", parentId: "tool", type: "CACHED" },
    ]);

    assert.deepStrictEqual(groupsByTool(spans), { tool: ["cached"] });
  });

  it("keeps a nested subagent inside its parent subagent's group", () => {
    const spans = buildSpans([
      { id: "root", type: "DEFAULT" },
      { id: "main_llm", parentId: "root", type: "LLM" },
      { id: "outer", parentId: "root", type: "TOOL" },
      { id: "outer_llm", parentId: "outer", type: "LLM" },
      { id: "inner", parentId: "outer", type: "TOOL" },
      { id: "inner_llm", parentId: "inner", type: "LLM" },
    ]);

    assert.deepStrictEqual(groupsByTool(spans), { outer: ["outer_llm", "inner", "inner_llm"] });
  });

  it("leaves handoffs inline: the handoff tool has no children and the next agent is its sibling", () => {
    // AgentA > agents.turn > {agents.handoff (TOOL), AgentB > ... > LLM}.
    const spans = buildSpans([
      { id: "agent_a", type: "DEFAULT" },
      { id: "turn", parentId: "agent_a", type: "DEFAULT" },
      { id: "a_llm", parentId: "turn", type: "LLM" },
      { id: "handoff", parentId: "turn", type: "TOOL", name: "agents.handoff" },
      { id: "agent_b", parentId: "turn", type: "DEFAULT" },
      { id: "b_llm", parentId: "agent_b", type: "LLM" },
    ]);

    assert.deepStrictEqual(computeSubagentGroups(spans), []);
  });

  it("peels a tool span wrapping the whole agent and groups the subagents inside it", () => {
    // The trace starts inside a tool (e.g. an MCP tool handler running an agent):
    // every LLM is under `entry`, so `entry` is not a subagent call-site.
    const spans = buildSpans([
      { id: "entry", type: "TOOL" },
      { id: "main_llm", parentId: "entry", type: "LLM" },
      { id: "sub_tool", parentId: "entry", type: "TOOL" },
      { id: "sub_llm", parentId: "sub_tool", type: "LLM" },
      { id: "main_llm_2", parentId: "entry", type: "LLM" },
    ]);

    assert.deepStrictEqual(groupsByTool(spans), { sub_tool: ["sub_llm"] });
  });

  it("returns no groups when the only tool with LLMs wraps the whole agent", () => {
    const spans = buildSpans([
      { id: "root", type: "DEFAULT" },
      { id: "entry", parentId: "root", type: "TOOL" },
      { id: "llm_1", parentId: "entry", type: "LLM" },
      { id: "leaf_tool", parentId: "entry", type: "TOOL" },
      { id: "llm_2", parentId: "entry", type: "LLM" },
    ]);

    assert.deepStrictEqual(computeSubagentGroups(spans), []);
  });

  it("treats spans whose parent is missing as roots", () => {
    // `agent` hasn't been exported yet (it ends after its children), so the
    // subagent LLMs reference a parent that isn't in the list: they stay inline.
    const spans = buildSpans([
      { id: "query", type: "DEFAULT" },
      { id: "main_llm", parentId: "query", type: "LLM" },
      { id: "sub_llm", parentId: "agent", type: "LLM" },
      { id: "done_tool", parentId: "query", type: "TOOL" },
      { id: "done_llm", parentId: "done_tool", type: "LLM" },
    ]);

    assert.deepStrictEqual(groupsByTool(spans), { done_tool: ["done_llm"] });
  });
});

// ---------------------------------------------------------------------------
// buildTranscriptListEntries
// ---------------------------------------------------------------------------

describe("buildTranscriptListEntries", () => {
  const claudeCodeTrace = () =>
    buildSpans([
      { id: "query", type: "DEFAULT" },
      { id: "main_1", parentId: "query", type: "LLM", name: "anthropic.messages" },
      { id: "agent", parentId: "query", type: "TOOL", name: "Agent" },
      { id: "sub_1", parentId: "agent", type: "LLM", name: "anthropic.messages" },
      { id: "sub_read", parentId: "agent", type: "TOOL", name: "Read" },
      { id: "sub_2", parentId: "agent", type: "LLM", name: "anthropic.messages" },
      { id: "main_2", parentId: "query", type: "LLM", name: "anthropic.messages" },
    ]);

  const summarize = (entries: ReturnType<typeof buildTranscriptListEntries>) =>
    entries.map((e) => {
      switch (e.type) {
        case "span":
          return `span:${e.span.spanId}`;
        case "group":
          return `group:${e.groupId}:${e.name}`;
        case "group-input":
          return `input:${e.firstLlmSpanId}`;
        case "group-span":
          return `group-span:${e.span.spanId}`;
      }
    });

  it("renders the spawning tool inline followed by the subagent's group block", () => {
    const entries = buildTranscriptListEntries(claudeCodeTrace(), new Set());

    assert.deepStrictEqual(summarize(entries), [
      "span:main_1",
      "span:agent",
      "group:group-agent:Agent",
      "input:sub_1",
      "group-span:sub_1",
      "group-span:sub_read",
      "group-span:sub_2",
      "span:main_2",
    ]);
    const group = entries.find((e) => e.type === "group");
    assert.ok(group && group.type === "group");
    assert.strictEqual(group.firstLlmSpanId, "sub_1");
    assert.strictEqual(group.lastLlmSpanId, "sub_2");
  });

  it("degrades a group to inline spans when visibility filtering hides all its LLMs", () => {
    const entries = buildTranscriptListEntries(claudeCodeTrace(), new Set(["query", "agent", "sub_read"]));

    assert.deepStrictEqual(summarize(entries), ["span:agent", "span:sub_read"]);
  });
});
