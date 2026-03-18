import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type SpanType } from "@/lib/traces/types";

export interface SpanTreeNode {
  span: TraceViewSpan;
  children: SpanTreeNode[];
  depth: number;
  subtreeStartTime: number; // epoch ms
  subtreeEndTime: number; // epoch ms
  subtreeSpanCount: number;
}

export interface CondensedBlock {
  parentSpanId: string;
  spanIds: string[];
  startTimeMs: number;
  endTimeMs: number;
  spanCount: number;
  depth: number;
  topRow: number;
  heightInRows: number;
  primarySpanType: SpanType;
  spanName: string;
  childNames: string[];
  childTypes: SpanType[];
}

export interface BlockSummary {
  summary: string;
  icon: string;
}
