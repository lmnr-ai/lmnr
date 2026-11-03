import assert from "node:assert/strict";
import { test } from "node:test";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import {
  computePathInfoMap,
  computeVisibleSpanIds,
  transformSpansToCondensedTimeline,
  transformSpansToTree,
} from "@/components/traces/trace-view/store/utils";
import { SpanType } from "@/lib/traces/types";

const mk = (spanId: string, parentSpanId?: string, spanType: SpanType = SpanType.DEFAULT): TraceViewSpan => ({
  spanId,
  parentSpanId,
  traceId: "trace-1",
  name: spanId,
  startTime: "2026-01-01T00:00:00.000Z",
  endTime: "2026-01-01T00:00:01.000Z",
  attributes: {},
  spanType,
  path: spanId,
  events: [],
  collapsed: false,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
});

// Spans whose parent was never ingested: a remote/cross-service parent, a span
// dropped by the OTel batch processor, tail sampling, or a truncated export.
const remoteParent: TraceViewSpan[] = [
  mk("svcB-root1", "svcA-job-span", SpanType.LLM),
  mk("svcB-root2", "svcA-job-span2", SpanType.TOOL),
  mk("svcB-child", "svcB-root1"),
];

test("orphan spans are rendered and promoted to roots in the tree", () => {
  const tree = transformSpansToTree(remoteParent);

  assert.deepEqual(tree.map((entry) => entry.span.spanId).sort(), ["svcB-child", "svcB-root1", "svcB-root2"]);
  assert.deepEqual(
    tree
      .filter((entry) => entry.depth === 0)
      .map((entry) => entry.span.spanId)
      .sort(),
    ["svcB-root1", "svcB-root2"]
  );
  assert.equal(tree.find((entry) => entry.span.spanId === "svcB-child")?.depth, 1);
});

test("orphan subtrees also appear in the condensed timeline", () => {
  const timeline = transformSpansToCondensedTimeline(remoteParent);

  assert.deepEqual(timeline.spans.map((entry) => entry.span.spanId).sort(), ["svcB-child", "svcB-root1", "svcB-root2"]);
});

test("a complete trace is unchanged (control)", () => {
  const tree = transformSpansToTree([mk("root"), mk("mid", "root")]);

  assert.deepEqual(
    tree.map((entry) => [entry.span.spanId, entry.depth]),
    [
      ["root", 0],
      ["mid", 1],
    ]
  );
});

// Collapsing a span hides its subtree; the leftover seeding must not re-add those
// children as depth-0 roots (`collapsed` stops the walk, it does not orphan them).
test("collapsed subtrees stay hidden instead of reappearing as roots", () => {
  const rootSpan = mk("root");
  rootSpan.collapsed = true;
  const spans = [rootSpan, mk("child", "root"), mk("grandchild", "child")];

  assert.deepEqual(
    transformSpansToTree(spans).map((entry) => entry.span.spanId),
    ["root"]
  );
});

// Malformed ingest: cyclic and self-referential parent links must not blow the stack.
test("cyclic parents do not throw and every span is rendered exactly once", () => {
  const cycle = [mk("a", "b"), mk("b", "a"), mk("c", "a")];

  assert.doesNotThrow(() => computePathInfoMap(cycle));

  const ids = transformSpansToTree(cycle).map((entry) => entry.span.spanId);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
});

test("self-parent does not throw", () => {
  assert.doesNotThrow(() => computePathInfoMap([mk("x", "x")]));
});

// The ancestor walk behind span selection is a `while` loop, so a cycle froze the
// tab instead of throwing; it must terminate now.
test("cyclic parents do not hang computeVisibleSpanIds", () => {
  const cycle = [mk("a", "b"), mk("b", "a"), mk("c", "a")];

  const visible = computeVisibleSpanIds(new Set(["c"]), cycle);

  assert.ok(visible.has("c"));
  assert.ok(visible.size < 10);
});
