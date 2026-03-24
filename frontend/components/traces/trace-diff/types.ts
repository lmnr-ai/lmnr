import { type TraceViewListSpan } from "@/components/traces/trace-view/store/base";

export type { SpanMapping } from "@/lib/actions/trace/diff/types";

export type DiffRow =
  | { type: "matched"; left: TraceViewListSpan; right: TraceViewListSpan }
  | { type: "left-only"; left: TraceViewListSpan }
  | { type: "right-only"; right: TraceViewListSpan };
