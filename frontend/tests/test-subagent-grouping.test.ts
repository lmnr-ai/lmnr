import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { computeSubagentGroups } from "@/components/traces/trace-view/store/utils";

type FixtureSpanType = "LLM" | "CACHED" | "TOOL" | "DEFAULT";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface SpanInput {
  id: string;
  parentId?: string;
  type: FixtureSpanType;
  /**
   * Path of ancestor segments (leaf last). Used for both `lmnr.span.path` and
   * `path`. The leaf must be unique enough to identify the span by name; the
   * preceding segments name its ancestors.
   */
  path: string[];
  /**
   * Span IDs of ancestors at each path position. MUST be the same length as
   * `path`, and `idsPath[idsPath.length - 1]` MUST equal `id`. This is what
   * the algorithm reads to figure out invocation roots.
   */
  idsPath: string[];
  promptHash?: string;
  /** ISO time string. Defaults are auto-assigned in document order. */
  startTime?: string;
  inputTokens?: number;
}

const T0 = new Date("2025-01-01T00:00:00.000Z").getTime();
const toTime = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1000).toISOString();

const makeSpan = (input: SpanInput, autoStartOffset: number): TraceViewSpan => {
  const last = input.idsPath[input.idsPath.length - 1];
  assert.strictEqual(last, input.id, `idsPath must end with span id for ${input.id}`);
  assert.strictEqual(input.idsPath.length, input.path.length, `idsPath/path length mismatch for ${input.id}`);

  const startTime = input.startTime ?? toTime(autoStartOffset);
  const endTime = toTime((input.startTime ? Date.parse(input.startTime) / 1000 - T0 / 1000 : autoStartOffset) + 1);

  return {
    spanId: input.id,
    parentSpanId: input.parentId,
    traceId: "trace-1",
    name: input.path[input.path.length - 1],
    startTime,
    endTime,
    attributes: {
      "lmnr.span.path": input.path,
      "lmnr.span.ids_path": input.idsPath,
      "lmnr.span.prompt_hash": input.promptHash ?? "",
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

/**
 * Convenience: get an unordered, set-style snapshot of subagent groups
 * keyed by their first member's span ID for easy assertions.
 */
const groupsBySpanIds = (spans: TraceViewSpan[]): Set<string>[] =>
  computeSubagentGroups(spans).map((g) => new Set(g.spanIds));

const groupContaining = (spans: TraceViewSpan[], spanId: string): Set<string> | null => {
  for (const g of groupsBySpanIds(spans)) {
    if (g.has(spanId)) return g;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe("computeSubagentGroups", () => {
  it("returns no groups when only one LLM span exists", () => {
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main_llm"],
        idsPath: ["root", "llm"],
        promptHash: "h1",
      },
    ]);
    assert.deepStrictEqual(computeSubagentGroups(spans), []);
  });

  it("returns no groups when every LLM span is hashless", () => {
    // No hashed LLMs → no reliably-identifiable main agent → grouping must be
    // suppressed entirely. Without the early return, every hashless LLM would
    // be promoted into a spurious group because pathHashKeyOf(s) (a string)
    // never equals mainPathHashKey (null).
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "llm_a",
        parentId: "root",
        type: "LLM",
        path: ["root", "llm_a"],
        idsPath: ["root", "llm_a"],
      },
      {
        id: "llm_b",
        parentId: "root",
        type: "LLM",
        path: ["root", "llm_b"],
        idsPath: ["root", "llm_b"],
      },
    ]);
    assert.deepStrictEqual(computeSubagentGroups(spans), []);
  });

  it("returns no groups for a single hashless LLM span", () => {
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main_llm"],
        idsPath: ["root", "llm"],
      },
    ]);
    assert.deepStrictEqual(computeSubagentGroups(spans), []);
  });

  it("groups multiple iterations of one subagent into a single group", () => {
    // One subagent invocation with three LLM iterations sharing one loop body.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      // Main agent LLM (shortest path among hashed LLMs => suppressed).
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      // Subagent invocation root (a TOOL span wrapping the inner loop).
      { id: "sub_call", parentId: "root", type: "TOOL", path: ["root", "sub_call"], idsPath: ["root", "sub_call"] },
      // Loop body for the subagent (reused across iterations).
      {
        id: "sub_loop",
        parentId: "sub_call",
        type: "DEFAULT",
        path: ["root", "sub_call", "sub_loop"],
        idsPath: ["root", "sub_call", "sub_loop"],
      },
      // Three LLM iterations under one shared loop body.
      {
        id: "iter_1",
        parentId: "sub_loop",
        type: "LLM",
        path: ["root", "sub_call", "sub_loop", "iter"],
        idsPath: ["root", "sub_call", "sub_loop", "iter_1"],
        promptHash: "sub_hash",
      },
      {
        id: "iter_2",
        parentId: "sub_loop",
        type: "LLM",
        path: ["root", "sub_call", "sub_loop", "iter"],
        idsPath: ["root", "sub_call", "sub_loop", "iter_2"],
        promptHash: "sub_hash",
      },
      {
        id: "iter_3",
        parentId: "sub_loop",
        type: "LLM",
        path: ["root", "sub_call", "sub_loop", "iter"],
        idsPath: ["root", "sub_call", "sub_loop", "iter_3"],
        promptHash: "sub_hash",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 1, "expected exactly one subagent group");
    // `sub_loop` is inside the invocation and joins. `sub_call` wraps the
    // invocation (its own ID is an ancestor of the LLMs) and stays out.
    assert.deepStrictEqual(groups[0], new Set(["iter_1", "iter_2", "iter_3", "sub_loop"]));
    assert.ok(!groupContaining(spans, "main_llm"));
    assert.ok(!groupContaining(spans, "sub_call"));
  });

  it("splits two separate invocations of the same subagent into separate groups", () => {
    // Two calls of the same (path, hash); only the wrapping invocation span differs.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      // Invocation A.
      { id: "call_a", parentId: "root", type: "TOOL", path: ["root", "task"], idsPath: ["root", "call_a"] },
      {
        id: "loop_a",
        parentId: "call_a",
        type: "DEFAULT",
        path: ["root", "task", "loop"],
        idsPath: ["root", "call_a", "loop_a"],
      },
      {
        id: "a_iter_1",
        parentId: "loop_a",
        type: "LLM",
        path: ["root", "task", "loop", "iter"],
        idsPath: ["root", "call_a", "loop_a", "a_iter_1"],
        promptHash: "sub_hash",
      },
      {
        id: "a_iter_2",
        parentId: "loop_a",
        type: "LLM",
        path: ["root", "task", "loop", "iter"],
        idsPath: ["root", "call_a", "loop_a", "a_iter_2"],
        promptHash: "sub_hash",
      },
      // Invocation B (same path + hash, different invocation root).
      { id: "call_b", parentId: "root", type: "TOOL", path: ["root", "task"], idsPath: ["root", "call_b"] },
      {
        id: "loop_b",
        parentId: "call_b",
        type: "DEFAULT",
        path: ["root", "task", "loop"],
        idsPath: ["root", "call_b", "loop_b"],
      },
      {
        id: "b_iter_1",
        parentId: "loop_b",
        type: "LLM",
        path: ["root", "task", "loop", "iter"],
        idsPath: ["root", "call_b", "loop_b", "b_iter_1"],
        promptHash: "sub_hash",
      },
      {
        id: "b_iter_2",
        parentId: "loop_b",
        type: "LLM",
        path: ["root", "task", "loop", "iter"],
        idsPath: ["root", "call_b", "loop_b", "b_iter_2"],
        promptHash: "sub_hash",
      },
      {
        id: "b_iter_3",
        parentId: "loop_b",
        type: "LLM",
        path: ["root", "task", "loop", "iter"],
        idsPath: ["root", "call_b", "loop_b", "b_iter_3"],
        promptHash: "sub_hash",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 2, "expected two subagent groups (one per invocation)");

    const groupA = groupContaining(spans, "a_iter_1");
    const groupB = groupContaining(spans, "b_iter_1");
    assert.ok(groupA && groupB);
    assert.notStrictEqual(groupA, groupB);
    // A's iterations are all in A; B's are all in B.
    assert.ok(groupA.has("a_iter_2"));
    assert.ok(!groupA.has("b_iter_1"));
    assert.ok(groupB.has("b_iter_2"));
    assert.ok(groupB.has("b_iter_3"));
  });

  it("treats different prompt hashes at the same code location as different subagents", () => {
    // Same parentSpanPath, three prompt hashes → three subagents.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      {
        id: "wrap",
        parentId: "root",
        type: "DEFAULT",
        path: ["root", "wrap"],
        idsPath: ["root", "wrap"],
      },
      {
        id: "llm_a",
        parentId: "wrap",
        type: "LLM",
        path: ["root", "wrap", "step"],
        idsPath: ["root", "wrap", "llm_a"],
        promptHash: "hash_A",
      },
      {
        id: "llm_b",
        parentId: "wrap",
        type: "LLM",
        path: ["root", "wrap", "step"],
        idsPath: ["root", "wrap", "llm_b"],
        promptHash: "hash_B",
      },
      {
        id: "llm_c",
        parentId: "wrap",
        type: "LLM",
        path: ["root", "wrap", "step"],
        idsPath: ["root", "wrap", "llm_c"],
        promptHash: "hash_C",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 3);
    for (const id of ["llm_a", "llm_b", "llm_c"]) {
      const g = groupContaining(spans, id);
      assert.ok(g, `${id} should be in a group`);
      assert.strictEqual(g!.size, 1, `${id}'s group should contain only itself (different hashes)`);
    }
  });

  it("bundles a non-LLM tool span into the right subagent via parent-id walk", () => {
    // Two subagents; each has an inner TOOL — each must join its own subagent.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      // Subagent A.
      { id: "call_a", parentId: "root", type: "TOOL", path: ["root", "a"], idsPath: ["root", "call_a"] },
      {
        id: "loop_a",
        parentId: "call_a",
        type: "DEFAULT",
        path: ["root", "a", "loop"],
        idsPath: ["root", "call_a", "loop_a"],
      },
      {
        id: "a_llm",
        parentId: "loop_a",
        type: "LLM",
        path: ["root", "a", "loop", "call"],
        idsPath: ["root", "call_a", "loop_a", "a_llm"],
        promptHash: "a_hash",
      },
      {
        id: "a_tool",
        parentId: "loop_a",
        type: "TOOL",
        path: ["root", "a", "loop", "search"],
        idsPath: ["root", "call_a", "loop_a", "a_tool"],
      },
      // Subagent B.
      { id: "call_b", parentId: "root", type: "TOOL", path: ["root", "b"], idsPath: ["root", "call_b"] },
      {
        id: "loop_b",
        parentId: "call_b",
        type: "DEFAULT",
        path: ["root", "b", "loop"],
        idsPath: ["root", "call_b", "loop_b"],
      },
      {
        id: "b_llm",
        parentId: "loop_b",
        type: "LLM",
        path: ["root", "b", "loop", "call"],
        idsPath: ["root", "call_b", "loop_b", "b_llm"],
        promptHash: "b_hash",
      },
      {
        id: "b_tool",
        parentId: "loop_b",
        type: "TOOL",
        path: ["root", "b", "loop", "search"],
        idsPath: ["root", "call_b", "loop_b", "b_tool"],
      },
    ]);

    const groupA = groupContaining(spans, "a_llm");
    const groupB = groupContaining(spans, "b_llm");
    assert.ok(groupA && groupB);
    assert.ok(groupA.has("a_tool"));
    assert.ok(!groupA.has("b_tool"));
    assert.ok(groupB.has("b_tool"));
    assert.ok(!groupB.has("a_tool"));
  });

  it("resolves a subagent even when chained through many default ancestor spans", () => {
    // Subagent invocations diverge only at one deep ancestor; everything
    // above is shared. Divergence detection must work without a hardcoded depth.
    const deepPath = (...tail: string[]) => ["root", "a", "b", "c", "d", ...tail];
    const deepIds = (...tail: string[]) => ["root", "a", "b", "c", "d", ...tail];

    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      { id: "a", parentId: "root", type: "DEFAULT", path: ["root", "a"], idsPath: ["root", "a"] },
      { id: "b", parentId: "a", type: "DEFAULT", path: ["root", "a", "b"], idsPath: ["root", "a", "b"] },
      { id: "c", parentId: "b", type: "DEFAULT", path: ["root", "a", "b", "c"], idsPath: ["root", "a", "b", "c"] },
      {
        id: "d",
        parentId: "c",
        type: "DEFAULT",
        path: ["root", "a", "b", "c", "d"],
        idsPath: ["root", "a", "b", "c", "d"],
      },
      {
        id: "main_llm",
        parentId: "d",
        type: "LLM",
        path: deepPath("main"),
        idsPath: deepIds("main_llm"),
        promptHash: "main_hash",
        inputTokens: 100,
      },
      // Invocation 1 of the subagent: enclosure_1 -> loop_1 -> llm_1.
      {
        id: "enclosure_1",
        parentId: "d",
        type: "TOOL",
        path: deepPath("task"),
        idsPath: deepIds("enclosure_1"),
      },
      {
        id: "loop_1",
        parentId: "enclosure_1",
        type: "DEFAULT",
        path: deepPath("task", "loop"),
        idsPath: deepIds("enclosure_1", "loop_1"),
      },
      {
        id: "iter_1a",
        parentId: "loop_1",
        type: "LLM",
        path: deepPath("task", "loop", "call"),
        idsPath: deepIds("enclosure_1", "loop_1", "iter_1a"),
        promptHash: "sub_hash",
      },
      {
        id: "iter_1b",
        parentId: "loop_1",
        type: "LLM",
        path: deepPath("task", "loop", "call"),
        idsPath: deepIds("enclosure_1", "loop_1", "iter_1b"),
        promptHash: "sub_hash",
      },
      // Invocation 2 of the same subagent: enclosure_2 -> loop_2 -> llm_2.
      {
        id: "enclosure_2",
        parentId: "d",
        type: "TOOL",
        path: deepPath("task"),
        idsPath: deepIds("enclosure_2"),
      },
      {
        id: "loop_2",
        parentId: "enclosure_2",
        type: "DEFAULT",
        path: deepPath("task", "loop"),
        idsPath: deepIds("enclosure_2", "loop_2"),
      },
      {
        id: "iter_2a",
        parentId: "loop_2",
        type: "LLM",
        path: deepPath("task", "loop", "call"),
        idsPath: deepIds("enclosure_2", "loop_2", "iter_2a"),
        promptHash: "sub_hash",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 2, "two invocations => two subagent groups");

    const g1 = groupContaining(spans, "iter_1a");
    const g2 = groupContaining(spans, "iter_2a");
    assert.ok(g1 && g2);
    assert.notStrictEqual(g1, g2);
    assert.ok(g1.has("iter_1b"), "both iterations of invocation 1 stay together");
    assert.ok(!g1.has("iter_2a"), "invocation 2 must not leak into invocation 1");
  });

  it("renders the main agent inline across multiple top-level invocations", () => {
    // Two main-agent calls (same path + hash) must not form a subagent group.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_call_1",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_call_1"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      {
        id: "main_call_2",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_call_2"],
        promptHash: "main_hash",
        inputTokens: 80,
      },
      // A subagent to anchor the main-agent detection.
      {
        id: "sub_wrap",
        parentId: "root",
        type: "DEFAULT",
        path: ["root", "sub"],
        idsPath: ["root", "sub_wrap"],
      },
      {
        id: "sub_loop",
        parentId: "sub_wrap",
        type: "DEFAULT",
        path: ["root", "sub", "loop"],
        idsPath: ["root", "sub_wrap", "sub_loop"],
      },
      {
        id: "sub_llm",
        parentId: "sub_loop",
        type: "LLM",
        path: ["root", "sub", "loop", "call"],
        idsPath: ["root", "sub_wrap", "sub_loop", "sub_llm"],
        promptHash: "sub_hash",
      },
    ]);

    assert.ok(!groupContaining(spans, "main_call_1"));
    assert.ok(!groupContaining(spans, "main_call_2"));
    assert.ok(groupContaining(spans, "sub_llm"));
  });

  it("gives LLM spans with no prompt hash their own group instead of dropping them", () => {
    // A hashless LLM next to a hashed sibling under the same parent: gets its own group.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      {
        id: "wrap",
        parentId: "root",
        type: "DEFAULT",
        path: ["root", "wrap"],
        idsPath: ["root", "wrap"],
      },
      {
        id: "hashless_llm",
        parentId: "wrap",
        type: "LLM",
        path: ["root", "wrap", "step"],
        idsPath: ["root", "wrap", "hashless_llm"],
      },
      {
        id: "hashed_llm",
        parentId: "wrap",
        type: "LLM",
        path: ["root", "wrap", "step"],
        idsPath: ["root", "wrap", "hashed_llm"],
        promptHash: "some_hash",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 2);
    const gHashless = groupContaining(spans, "hashless_llm");
    const gHashed = groupContaining(spans, "hashed_llm");
    assert.ok(gHashless && gHashed);
    assert.notStrictEqual(gHashless, gHashed);
    assert.ok(!gHashless!.has("hashed_llm"));
    assert.ok(!gHashed!.has("hashless_llm"));
  });

  it("collapses iterations even when each iteration spawns a fresh loop-body span", () => {
    // Divergence at length-2 (each LLM's direct parent) is iteration-level
    // noise and must not split the subagent.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      { id: "call", parentId: "root", type: "TOOL", path: ["root", "task"], idsPath: ["root", "call"] },
      // Each iteration has its OWN loop body span.
      {
        id: "loop_i1",
        parentId: "call",
        type: "DEFAULT",
        path: ["root", "task", "loop"],
        idsPath: ["root", "call", "loop_i1"],
      },
      {
        id: "llm_i1",
        parentId: "loop_i1",
        type: "LLM",
        path: ["root", "task", "loop", "call"],
        idsPath: ["root", "call", "loop_i1", "llm_i1"],
        promptHash: "sub_hash",
      },
      {
        id: "loop_i2",
        parentId: "call",
        type: "DEFAULT",
        path: ["root", "task", "loop"],
        idsPath: ["root", "call", "loop_i2"],
      },
      {
        id: "llm_i2",
        parentId: "loop_i2",
        type: "LLM",
        path: ["root", "task", "loop", "call"],
        idsPath: ["root", "call", "loop_i2", "llm_i2"],
        promptHash: "sub_hash",
      },
      {
        id: "loop_i3",
        parentId: "call",
        type: "DEFAULT",
        path: ["root", "task", "loop"],
        idsPath: ["root", "call", "loop_i3"],
      },
      {
        id: "llm_i3",
        parentId: "loop_i3",
        type: "LLM",
        path: ["root", "task", "loop", "call"],
        idsPath: ["root", "call", "loop_i3", "llm_i3"],
        promptHash: "sub_hash",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 1, "iterations under fresh-per-step loop bodies still collapse to one subagent");
    assert.ok(groups[0].has("llm_i1"));
    assert.ok(groups[0].has("llm_i2"));
    assert.ok(groups[0].has("llm_i3"));
  });

  it("tie-breaks tool assignment by nearest preceding LLM when multiple subagents share a parent", () => {
    // Two subagent LLMs are siblings under one orchestrator span. A TOOL between
    // them joins whichever LLM most recently preceded it.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
        startTime: toTime(0),
      },
      {
        id: "orchestrator",
        parentId: "root",
        type: "DEFAULT",
        path: ["root", "orchestrator"],
        idsPath: ["root", "orchestrator"],
        startTime: toTime(1),
      },
      {
        id: "step0_llm",
        parentId: "orchestrator",
        type: "LLM",
        path: ["root", "orchestrator", "step_0", "call"],
        idsPath: ["root", "orchestrator", "step0_loop", "step0_llm"],
        promptHash: "step_hash",
        startTime: toTime(2),
      },
      // Tool fired between the two subagent LLM calls.
      {
        id: "between_tool",
        parentId: "orchestrator",
        type: "TOOL",
        path: ["root", "orchestrator", "fetch"],
        idsPath: ["root", "orchestrator", "between_tool"],
        startTime: toTime(3),
      },
      {
        id: "step1_llm",
        parentId: "orchestrator",
        type: "LLM",
        path: ["root", "orchestrator", "step_1", "call"],
        idsPath: ["root", "orchestrator", "step1_loop", "step1_llm"],
        promptHash: "step_hash",
        startTime: toTime(4),
      },
      // Tool fired after the second subagent LLM call.
      {
        id: "after_tool",
        parentId: "orchestrator",
        type: "TOOL",
        path: ["root", "orchestrator", "fetch"],
        idsPath: ["root", "orchestrator", "after_tool"],
        startTime: toTime(5),
      },
    ]);

    const g0 = groupContaining(spans, "step0_llm");
    const g1 = groupContaining(spans, "step1_llm");
    assert.ok(g0 && g1);
    assert.notStrictEqual(g0, g1);
    assert.ok(g0.has("between_tool"), "between_tool should follow the nearest preceding LLM (step_0)");
    assert.ok(!g1.has("between_tool"));
    assert.ok(g1.has("after_tool"), "after_tool should follow the nearest preceding LLM (step_1)");
    assert.ok(!g0.has("after_tool"));
  });

  it("keeps a tool standalone when its deepest claimed ancestor is also a main-agent ancestor", () => {
    // Main agent and subagents share the `orchestrator` ancestor. A TOOL whose
    // deepest claimed ancestor is `orchestrator` stays standalone (main wins ties).
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "orchestrator",
        parentId: "root",
        type: "DEFAULT",
        path: ["root", "orchestrator"],
        idsPath: ["root", "orchestrator"],
      },
      // Main agent LLM lives directly under `orchestrator`.
      {
        id: "main_llm",
        parentId: "orchestrator",
        type: "LLM",
        path: ["root", "orchestrator", "main"],
        idsPath: ["root", "orchestrator", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 200,
      },
      // Sibling tool of the main LLM — same parent, shouldn't join any subagent.
      {
        id: "main_tool",
        parentId: "orchestrator",
        type: "TOOL",
        path: ["root", "orchestrator", "fetch"],
        idsPath: ["root", "orchestrator", "main_tool"],
      },
      // Subagent 1 — its LLM is also under `orchestrator` but the path differs.
      {
        id: "sub1_llm",
        parentId: "orchestrator",
        type: "LLM",
        path: ["root", "orchestrator", "sub_a"],
        idsPath: ["root", "orchestrator", "sub1_llm"],
        promptHash: "sub_a_hash",
      },
      // Subagent 2 — same scope sibling.
      {
        id: "sub2_llm",
        parentId: "orchestrator",
        type: "LLM",
        path: ["root", "orchestrator", "sub_b"],
        idsPath: ["root", "orchestrator", "sub2_llm"],
        promptHash: "sub_b_hash",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 2);
    assert.ok(!groupContaining(spans, "main_tool"));
    assert.ok(!groupContaining(spans, "main_llm"));
  });

  it("leaves spans without an ids_path attribute standalone instead of crashing", () => {
    // Older instrumentation may emit spans missing `lmnr.span.ids_path`.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      {
        id: "sub_wrap",
        parentId: "root",
        type: "DEFAULT",
        path: ["root", "sub"],
        idsPath: ["root", "sub_wrap"],
      },
      {
        id: "sub_llm",
        parentId: "sub_wrap",
        type: "LLM",
        path: ["root", "sub", "call"],
        idsPath: ["root", "sub_wrap", "sub_llm"],
        promptHash: "sub_hash",
      },
    ]);
    // Strip ids_path from a tool span to simulate missing attribute.
    const orphanTool: TraceViewSpan = {
      ...makeSpan(
        {
          id: "orphan",
          parentId: "root",
          type: "TOOL",
          path: ["root", "orphan"],
          idsPath: ["root", "orphan"],
        },
        spans.length
      ),
      attributes: { "lmnr.span.path": ["root", "orphan"], "lmnr.span.prompt_hash": "" },
    };
    spans.push(orphanTool);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 1);
    assert.ok(groups[0].has("sub_llm"));
    assert.ok(!groupContaining(spans, "orphan"), "orphan tool with no ids_path must stay standalone");
  });

  it("splits three invocations correctly when their divergence depths differ", () => {
    // Pathological cluster: three subagent invocations of the same (path, hash)
    // where the structural divergences happen at TWO different depths.
    //
    //   root
    //   ├── X
    //   │   ├── inv_A -> loop_A -> llm_A
    //   │   └── inv_B -> loop_B -> llm_B    (A vs B diverge at idx=2)
    //   └── Y
    //       └── inv_C -> loop_C -> llm_C    (A vs C diverge at idx=1)
    //
    // A naive "first index where any member differs from cluster[0]" picks
    // idx=1 and keys A and B with the same root (X), incorrectly merging
    // two independent invocations. Using the full structural prefix as the
    // key separates them.
    const sharedPath = ["root", "branch", "task", "loop", "call"];
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      { id: "X", parentId: "root", type: "DEFAULT", path: ["root", "branch"], idsPath: ["root", "X"] },
      { id: "inv_A", parentId: "X", type: "TOOL", path: ["root", "branch", "task"], idsPath: ["root", "X", "inv_A"] },
      {
        id: "loop_A",
        parentId: "inv_A",
        type: "DEFAULT",
        path: ["root", "branch", "task", "loop"],
        idsPath: ["root", "X", "inv_A", "loop_A"],
      },
      {
        id: "llm_A",
        parentId: "loop_A",
        type: "LLM",
        path: sharedPath,
        idsPath: ["root", "X", "inv_A", "loop_A", "llm_A"],
        promptHash: "sub_hash",
      },
      { id: "inv_B", parentId: "X", type: "TOOL", path: ["root", "branch", "task"], idsPath: ["root", "X", "inv_B"] },
      {
        id: "loop_B",
        parentId: "inv_B",
        type: "DEFAULT",
        path: ["root", "branch", "task", "loop"],
        idsPath: ["root", "X", "inv_B", "loop_B"],
      },
      {
        id: "llm_B",
        parentId: "loop_B",
        type: "LLM",
        path: sharedPath,
        idsPath: ["root", "X", "inv_B", "loop_B", "llm_B"],
        promptHash: "sub_hash",
      },
      { id: "Y", parentId: "root", type: "DEFAULT", path: ["root", "branch"], idsPath: ["root", "Y"] },
      { id: "inv_C", parentId: "Y", type: "TOOL", path: ["root", "branch", "task"], idsPath: ["root", "Y", "inv_C"] },
      {
        id: "loop_C",
        parentId: "inv_C",
        type: "DEFAULT",
        path: ["root", "branch", "task", "loop"],
        idsPath: ["root", "Y", "inv_C", "loop_C"],
      },
      {
        id: "llm_C",
        parentId: "loop_C",
        type: "LLM",
        path: sharedPath,
        idsPath: ["root", "Y", "inv_C", "loop_C", "llm_C"],
        promptHash: "sub_hash",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 3, "three invocations => three subagent groups");
    const gA = groupContaining(spans, "llm_A");
    const gB = groupContaining(spans, "llm_B");
    const gC = groupContaining(spans, "llm_C");
    assert.ok(gA && gB && gC);
    assert.notStrictEqual(gA, gB, "A and B share branch X but are distinct invocations");
    assert.notStrictEqual(gA, gC);
    assert.notStrictEqual(gB, gC);
  });

  it("excludes the wrapping TOOL/DEFAULT span from the subagent group it encloses", () => {
    // The span whose own ID appears as an ancestor of the subagent's LLM is the
    // call-site from the parent agent and must render OUTSIDE the group.
    const spans = buildSpans([
      { id: "root", type: "DEFAULT", path: ["root"], idsPath: ["root"] },
      {
        id: "main_llm",
        parentId: "root",
        type: "LLM",
        path: ["root", "main"],
        idsPath: ["root", "main_llm"],
        promptHash: "main_hash",
        inputTokens: 100,
      },
      // The wrapping TOOL — the subagent's invocation starts here.
      { id: "wrap", parentId: "root", type: "TOOL", path: ["root", "wrap"], idsPath: ["root", "wrap"] },
      // An intermediate DEFAULT span between the wrapper and the LLM.
      {
        id: "inner",
        parentId: "wrap",
        type: "DEFAULT",
        path: ["root", "wrap", "inner"],
        idsPath: ["root", "wrap", "inner"],
      },
      {
        id: "sub_llm",
        parentId: "inner",
        type: "LLM",
        path: ["root", "wrap", "inner", "call"],
        idsPath: ["root", "wrap", "inner", "sub_llm"],
        promptHash: "sub_hash",
      },
    ]);

    const groups = groupsBySpanIds(spans);
    assert.strictEqual(groups.length, 1);
    assert.ok(groups[0].has("sub_llm"));
    assert.ok(groups[0].has("inner")); // inside the invocation
    assert.ok(!groups[0].has("wrap")); // the call-site stays out
  });
});
