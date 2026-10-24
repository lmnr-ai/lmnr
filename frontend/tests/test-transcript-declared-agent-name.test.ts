import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type TraceViewSpan, type TranscriptListGroup } from "@/components/traces/trace-view/store/base";
import { buildTranscriptListEntries, transcriptGroupTitle } from "@/components/traces/trace-view/store/utils";
import { buildTraceViewAttributesExpression, TRACE_VIEW_ATTRIBUTE_KEYS } from "@/lib/actions/spans/utils";

type FixtureSpanType = "LLM" | "DEFAULT" | "TOOL";

interface SpanInput {
  id: string;
  parentId?: string;
  type: FixtureSpanType;
  path: string[];
  idsPath: string[];
  promptHash?: string;
  agentName?: string;
  inputTokens?: number;
}

const T0 = new Date("2025-01-01T00:00:00.000Z").getTime();
const toTime = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1000).toISOString();

const makeSpan = (input: SpanInput, i: number): TraceViewSpan => {
  assert.equal(input.idsPath[input.idsPath.length - 1], input.id);
  return {
    spanId: input.id,
    parentSpanId: input.parentId,
    traceId: "trace-1",
    name: input.path[input.path.length - 1],
    startTime: toTime(i),
    endTime: toTime(i + 1),
    attributes: {
      "lmnr.span.path": input.path,
      "lmnr.span.ids_path": input.idsPath,
      "lmnr.span.prompt_hash": input.promptHash ?? "",
      ...(input.agentName !== undefined ? { "gen_ai.agent.name": input.agentName } : {}),
    },
    spanType: input.type as TraceViewSpan["spanType"],
    path: input.path.join("."),
    events: [],
    collapsed: false,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
  };
};

const buildSpans = (inputs: SpanInput[]): TraceViewSpan[] => inputs.map((s, i) => makeSpan(s, i));

const groupForLlm = (spans: TraceViewSpan[], llmId: string): TranscriptListGroup => {
  const group = buildTranscriptListEntries(spans, new Set()).find(
    (e): e is TranscriptListGroup => e.type === "group" && e.firstLlmSpanId === llmId
  );
  assert.ok(group, `expected a transcript group anchored on ${llmId}`);
  return group;
};

const mainLlm = (): SpanInput => ({
  id: "main_llm",
  parentId: "root",
  type: "LLM",
  path: ["root", "main"],
  idsPath: ["root", "main_llm"],
  promptHash: "main_hash",
  inputTokens: 100,
});

/** Two invoke_agent runs of the same (path, hash). Two LLMs each so grouping splits them. */
const twoWorkers = (names: { a?: string; b?: string }): TraceViewSpan[] => {
  const worker = (id: string, agentName: string | undefined, llms: [string, string]): SpanInput[] => [
    { id, parentId: "root", type: "DEFAULT", path: ["root", "invoke_agent"], idsPath: ["root", id], agentName },
    ...llms.map((llmId) => ({
      id: llmId,
      parentId: id,
      type: "LLM" as const,
      path: ["root", "invoke_agent", "chat"],
      idsPath: ["root", id, llmId],
      promptHash: "sub_hash",
    })),
  ];
  return buildSpans([
    { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
    mainLlm(),
    ...worker("invoke_a", names.a, ["llm_a1", "llm_a2"]),
    ...worker("invoke_b", names.b, ["llm_b1", "llm_b2"]),
  ]);
};

describe("transcript declared agent names", () => {
  it("sets declaredName from the nearest ancestor gen_ai.agent.name per instance", () => {
    const spans = twoWorkers({ a: "Research - Pricing", b: "Research - Competitors" });
    assert.equal(groupForLlm(spans, "llm_a1").declaredName, "Research - Pricing");
    assert.equal(groupForLlm(spans, "llm_b1").declaredName, "Research - Competitors");
  });

  it("prefers a closer ancestor and skips empty gen_ai.agent.name", () => {
    const nested = (innerName: string) =>
      buildSpans([
        { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
        mainLlm(),
        {
          id: "outer",
          parentId: "root",
          type: "DEFAULT",
          path: ["root", "outer"],
          idsPath: ["root", "outer"],
          agentName: "Outer",
        },
        {
          id: "inner",
          parentId: "outer",
          type: "DEFAULT",
          path: ["root", "outer", "inner"],
          idsPath: ["root", "outer", "inner"],
          agentName: innerName,
        },
        {
          id: "sub_llm",
          parentId: "inner",
          type: "LLM",
          path: ["root", "outer", "inner", "chat"],
          idsPath: ["root", "outer", "inner", "sub_llm"],
          promptHash: "sub_hash",
        },
      ]);
    assert.equal(groupForLlm(nested("Inner"), "sub_llm").declaredName, "Inner");
    assert.equal(groupForLlm(nested(""), "sub_llm").declaredName, "Outer");
  });

  it("leaves declaredName null when nothing is declared", () => {
    const group = groupForLlm(twoWorkers({}), "llm_a1");
    assert.equal(group.declaredName, null);
    assert.equal(group.name, "chat");
  });

  it("reads gen_ai.agent.name off the LLM span itself", () => {
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      mainLlm(),
      { id: "wrap", parentId: "root", type: "DEFAULT", path: ["root", "wrap"], idsPath: ["root", "wrap"] },
      {
        id: "sub_llm",
        parentId: "wrap",
        type: "LLM",
        path: ["root", "wrap", "chat"],
        idsPath: ["root", "wrap", "sub_llm"],
        promptHash: "sub_hash",
        agentName: "OnLlm",
      },
    ]);
    assert.equal(groupForLlm(spans, "sub_llm").declaredName, "OnLlm");
  });

  it("title order is declared, then generated, then span name", () => {
    const declared = groupForLlm(twoWorkers({ a: "Research - Pricing" }), "llm_a1");
    assert.equal(transcriptGroupTitle(declared, { llm_a1: "Code Review" }), "Research - Pricing");
    const none = groupForLlm(twoWorkers({}), "llm_a1");
    assert.equal(transcriptGroupTitle(none, { llm_a1: "Code Review" }), "Code Review");
    assert.equal(transcriptGroupTitle(none, { llm_a1: null }), "chat");
  });

  it("does not take gen_ai.agent.name from a main-agent ancestor", () => {
    const spans = buildSpans([
      {
        id: "root",
        type: "DEFAULT",
        path: ["root"],
        idsPath: ["root"],
        agentName: "MainAgent",
      },
      mainLlm(),
      { id: "tool", parentId: "root", type: "TOOL", path: ["root", "tool"], idsPath: ["root", "tool"] },
      {
        id: "sub1",
        parentId: "tool",
        type: "LLM",
        path: ["root", "tool", "chat"],
        idsPath: ["root", "tool", "sub1"],
        promptHash: "sub_hash",
      },
      {
        id: "sub2",
        parentId: "tool",
        type: "LLM",
        path: ["root", "tool", "chat"],
        idsPath: ["root", "tool", "sub2"],
        promptHash: "sub_hash",
      },
    ]);
    assert.equal(groupForLlm(spans, "sub1").declaredName, null);
  });

  it("leaves declaredName null when a merged group has conflicting names", () => {
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      mainLlm(),
      {
        id: "invoke_a",
        parentId: "root",
        type: "DEFAULT",
        path: ["root", "invoke_agent"],
        idsPath: ["root", "invoke_a"],
        agentName: "Research - Pricing",
      },
      {
        id: "la",
        parentId: "invoke_a",
        type: "LLM",
        path: ["root", "invoke_agent", "chat"],
        idsPath: ["root", "invoke_a", "la"],
        promptHash: "sub_hash",
      },
      {
        id: "invoke_b",
        parentId: "root",
        type: "DEFAULT",
        path: ["root", "invoke_agent"],
        idsPath: ["root", "invoke_b"],
        agentName: "Research - Competitors",
      },
      {
        id: "lb",
        parentId: "invoke_b",
        type: "LLM",
        path: ["root", "invoke_agent", "chat"],
        idsPath: ["root", "invoke_b", "lb"],
        promptHash: "sub_hash",
      },
    ]);
    const groups = buildTranscriptListEntries(spans, new Set()).filter(
      (e): e is TranscriptListGroup => e.type === "group"
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0].declaredName, null);
    assert.equal(groups[0].firstLlmSpanId, "la");
    assert.equal(groups[0].lastLlmSpanId, "lb");
  });

  it("extracts gen_ai.agent.name in the trace-view attributes subset", () => {
    assert.ok(TRACE_VIEW_ATTRIBUTE_KEYS.includes("gen_ai.agent.name"));
    assert.match(buildTraceViewAttributesExpression(), /gen_ai\.agent\.name/);
  });
});
