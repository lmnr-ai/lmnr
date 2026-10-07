import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { transformSpansToCondensedTimeline } from "@/components/traces/trace-view/store/utils";
import { SpanType } from "@/lib/traces/types";

const makeSpan = ({
  spanId,
  parentSpanId,
  startMs,
  endMs,
}: {
  spanId: string;
  parentSpanId?: string;
  startMs: number;
  endMs: number;
}): TraceViewSpan => ({
  spanId,
  parentSpanId,
  traceId: "trace-1",
  name: spanId,
  startTime: new Date(startMs).toISOString(),
  endTime: new Date(endMs).toISOString(),
  attributes: {},
  spanType: parentSpanId ? SpanType.TOOL : SpanType.DEFAULT,
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

describe("transformSpansToCondensedTimeline", () => {
  it("packs adjacent millisecond spans into the same row", () => {
    const origin = Date.UTC(2025, 0, 1);
    const root = makeSpan({ spanId: "root", startMs: origin, endMs: origin + 102 });
    const children = Array.from({ length: 100 }, (_, index) =>
      makeSpan({
        spanId: `tool-${index}`,
        parentSpanId: root.spanId,
        startMs: origin + index + 1,
        endMs: origin + index + 2,
      })
    );

    const timeline = transformSpansToCondensedTimeline([root, ...children]);
    const childRows = timeline.spans.filter(({ span }) => span.parentSpanId === root.spanId).map(({ row }) => row);

    assert.deepEqual(new Set(childRows), new Set([1]));
    assert.equal(timeline.totalRows, 2);
  });
});
