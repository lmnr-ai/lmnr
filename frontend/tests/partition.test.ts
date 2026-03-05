import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SpanInfo } from "@/lib/actions/trace/agent/spans";
import {
  buildAnnotatedTree,
  buildCollapsedSkeleton,
  buildSubSkeleton,
  collectSubtreeSpanIds,
  findPartitionPoints,
  identifyNonLeafBlocks,
} from "@/lib/actions/trace/diff/partition";

// Helper to create SpanInfo objects
function span(id: string, parent: string, type: string, name?: string): SpanInfo {
  return {
    spanId: id,
    name: name ?? `span-${id}`,
    type,
    path: `path.${id}`,
    start: "2024-01-01 00:00:00.000",
    end: "2024-01-01 00:00:01.000",
    status: "ok",
    parent,
  };
}

describe("buildAnnotatedTree", () => {
  it("counts LLM/TOOL descendants correctly", () => {
    // Tree:
    //   root (DEFAULT)
    //     ├── child1 (LLM)
    //     └── child2 (DEFAULT)
    //           ├── grandchild1 (TOOL)
    //           └── grandchild2 (LLM)
    const spanInfos: SpanInfo[] = [
      span("root", "", "DEFAULT"),
      span("child1", "root", "LLM"),
      span("child2", "root", "DEFAULT"),
      span("gc1", "child2", "TOOL"),
      span("gc2", "child2", "LLM"),
    ];

    const roots = buildAnnotatedTree(spanInfos);
    assert.equal(roots.length, 1);

    const root = roots[0];
    assert.equal(root.llmToolDescendantCount, 3); // child1 + gc1 + gc2
    assert.equal(root.children.length, 2);

    const child1 = root.children[0];
    assert.equal(child1.llmToolDescendantCount, 0); // leaf

    const child2 = root.children[1];
    assert.equal(child2.llmToolDescendantCount, 2); // gc1 + gc2
  });

  it("handles multiple roots", () => {
    const spanInfos: SpanInfo[] = [span("r1", "", "DEFAULT"), span("r2", "", "LLM"), span("c1", "r1", "LLM")];

    const roots = buildAnnotatedTree(spanInfos);
    assert.equal(roots.length, 2);
    assert.equal(roots[0].llmToolDescendantCount, 1);
    assert.equal(roots[1].llmToolDescendantCount, 0);
  });
});

describe("findPartitionPoints", () => {
  it("returns empty set for small traces below threshold", () => {
    const spanInfos: SpanInfo[] = [span("root", "", "DEFAULT"), span("c1", "root", "LLM"), span("c2", "root", "TOOL")];
    const roots = buildAnnotatedTree(spanInfos);
    const points = findPartitionPoints(roots, 20);
    assert.equal(points.size, 0);
  });

  it("finds deepest nodes meeting threshold", () => {
    // Build a tree where root has 6 LLM/TOOL descendants,
    // split across two subtrees of 3 each, with threshold=3
    const spanInfos: SpanInfo[] = [
      span("root", "", "DEFAULT"),
      span("sub1", "root", "DEFAULT"),
      span("sub2", "root", "DEFAULT"),
      span("a1", "sub1", "LLM"),
      span("a2", "sub1", "TOOL"),
      span("a3", "sub1", "LLM"),
      span("b1", "sub2", "LLM"),
      span("b2", "sub2", "TOOL"),
      span("b3", "sub2", "LLM"),
    ];

    const roots = buildAnnotatedTree(spanInfos);

    // root has 6 descendants, sub1 has 3, sub2 has 3
    assert.equal(roots[0].llmToolDescendantCount, 6);
    assert.equal(roots[0].children[0].llmToolDescendantCount, 3);
    assert.equal(roots[0].children[1].llmToolDescendantCount, 3);

    // With threshold=3, sub1 and sub2 are partition points (deepest >= 3)
    const points = findPartitionPoints(roots, 3);
    assert.equal(points.size, 2);
    assert.ok(points.has("sub1"));
    assert.ok(points.has("sub2"));
    assert.ok(!points.has("root")); // root is not a partition point because children meet threshold
  });

  it("picks root as partition when no children meet threshold", () => {
    // root has 3 LLM children directly, no intermediate DEFAULT nodes
    const spanInfos: SpanInfo[] = [
      span("root", "", "DEFAULT"),
      span("c1", "root", "LLM"),
      span("c2", "root", "TOOL"),
      span("c3", "root", "LLM"),
    ];

    const roots = buildAnnotatedTree(spanInfos);
    const points = findPartitionPoints(roots, 3);
    assert.equal(points.size, 1);
    assert.ok(points.has("root"));
  });
});

describe("collectSubtreeSpanIds", () => {
  it("collects all descendants including root", () => {
    const spanInfos: SpanInfo[] = [
      span("root", "", "DEFAULT"),
      span("sub", "root", "DEFAULT"),
      span("c1", "sub", "LLM"),
      span("c2", "sub", "TOOL"),
      span("other", "root", "LLM"),
    ];

    const roots = buildAnnotatedTree(spanInfos);
    const ids = collectSubtreeSpanIds(roots, "sub");

    assert.equal(ids.size, 3); // sub, c1, c2
    assert.ok(ids.has("sub"));
    assert.ok(ids.has("c1"));
    assert.ok(ids.has("c2"));
    assert.ok(!ids.has("root"));
    assert.ok(!ids.has("other"));
  });
});

describe("identifyNonLeafBlocks", () => {
  it("identifies non-leaf nodes within subtree", () => {
    const spanInfos: SpanInfo[] = [
      span("root", "", "DEFAULT"),
      span("sub", "root", "DEFAULT"),
      span("c1", "sub", "LLM"),
      span("c2", "sub", "TOOL"),
    ];

    const subtreeIds = new Set(["sub", "c1", "c2"]);
    const nonLeaves = identifyNonLeafBlocks(spanInfos, subtreeIds);

    assert.equal(nonLeaves.length, 1);
    assert.ok(nonLeaves.includes("sub"));
  });

  it("returns empty for all-leaf subtree", () => {
    const spanInfos: SpanInfo[] = [span("a", "", "LLM"), span("b", "", "TOOL")];
    const subtreeIds = new Set(["a", "b"]);
    const nonLeaves = identifyNonLeafBlocks(spanInfos, subtreeIds);
    assert.equal(nonLeaves.length, 0);
  });
});

describe("buildSubSkeleton", () => {
  it("builds skeleton with local sequential IDs", () => {
    const spanInfos: SpanInfo[] = [
      span("root", "", "DEFAULT", "Root"),
      span("child", "root", "LLM", "Child"),
      span("other", "", "TOOL", "Other"),
    ];

    const subtreeIds = new Set(["root", "child"]);
    const { skeleton, localSeqIdMap } = buildSubSkeleton(spanInfos, subtreeIds);

    // Local IDs should be 1 and 2
    assert.equal(localSeqIdMap.get("root"), 1);
    assert.equal(localSeqIdMap.get("child"), 2);
    assert.ok(!localSeqIdMap.has("other"));

    assert.ok(skeleton.includes("Root (1, null, DEFAULT)"));
    assert.ok(skeleton.includes("Child (2, 1, LLM)"));
    assert.ok(!skeleton.includes("Other"));
  });
});

describe("buildCollapsedSkeleton", () => {
  it("replaces partition subtrees with summary lines", () => {
    const spanInfos: SpanInfo[] = [
      span("root", "", "DEFAULT", "Root"),
      span("sub", "root", "DEFAULT", "SubAgent"),
      span("c1", "sub", "LLM", "LLMCall"),
      span("c2", "sub", "TOOL", "ToolCall"),
      span("top-llm", "root", "LLM", "TopLLM"),
    ];

    const deepSummaries = new Map([["sub", "Performs web search and summarizes results"]]);
    const partitionSubtrees = new Map([["sub", new Set(["sub", "c1", "c2"])]]);

    const skeleton = buildCollapsedSkeleton(spanInfos, deepSummaries, partitionSubtrees);

    // Root and top-llm should appear normally
    assert.ok(skeleton.includes("Root (1, null, DEFAULT)"));
    assert.ok(skeleton.includes("TopLLM (5, 1, LLM)"));

    // SubAgent should appear collapsed with summary
    assert.ok(skeleton.includes("SubAgent (2, 1, BLOCK) [Summary: Performs web search and summarizes results]"));

    // Children of partition should NOT appear
    assert.ok(!skeleton.includes("LLMCall"));
    assert.ok(!skeleton.includes("ToolCall"));
  });
});

describe("end-to-end partitioning flow", () => {
  it("partitions a large tree and builds correct sub-contexts", () => {
    // Build a trace with 25 LLM/TOOL spans under one subtree
    const spanInfos: SpanInfo[] = [
      span("root", "", "DEFAULT", "AgentLoop"),
      span("setup", "root", "LLM", "SetupLLM"),
      span("agent", "root", "DEFAULT", "AgentSubtree"),
    ];

    // Add 22 LLM/TOOL spans under "agent"
    for (let i = 0; i < 22; i++) {
      spanInfos.push(span(`llm-${i}`, "agent", i % 2 === 0 ? "LLM" : "TOOL", `Step${i}`));
    }

    const roots = buildAnnotatedTree(spanInfos);
    assert.equal(roots[0].llmToolDescendantCount, 23); // setup + 22 under agent

    const points = findPartitionPoints(roots, 20);
    // "agent" has 22 descendants, root has 23 — agent is the deepest >= 20
    assert.equal(points.size, 1);
    assert.ok(points.has("agent"));

    // Collect subtree
    const subtreeIds = collectSubtreeSpanIds(roots, "agent");
    assert.equal(subtreeIds.size, 23); // agent + 22 children

    // Build sub-skeleton
    const { skeleton, localSeqIdMap } = buildSubSkeleton(spanInfos, subtreeIds);
    assert.equal(localSeqIdMap.size, 23);
    assert.ok(skeleton.includes("AgentSubtree"));
    assert.ok(skeleton.includes("Step0"));
    assert.ok(!skeleton.includes("SetupLLM"));
    assert.ok(!skeleton.includes("AgentLoop"));
  });
});
