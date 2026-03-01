import { type TraceViewListSpan } from "@/components/traces/trace-view/store/base";

export type DiffRow =
  | { type: "matched"; left: TraceViewListSpan; right: TraceViewListSpan }
  | { type: "left-only"; left: TraceViewListSpan }
  | { type: "right-only"; right: TraceViewListSpan };

// Array of [leftSpanId, rightSpanId] pairs
export type SpanMapping = Array<[string, string]>;
