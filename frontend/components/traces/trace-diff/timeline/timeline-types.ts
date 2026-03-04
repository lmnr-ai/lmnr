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
  /** The span that roots this block (may group its subtree) */
  parentSpanId: string;
  /** All span IDs grouped into this block (including the root span) */
  spanIds: string[];
  startTimeMs: number;
  endTimeMs: number;
  spanCount: number;
  depth: number;
  row: number;
  primarySpanType: SpanType;
  spanName: string;
  /** Names of direct children (for summarization context) */
  childNames: string[];
  /** Types of direct children */
  childTypes: SpanType[];
}

export interface BlockSummary {
  summary: string;
  icon: string;
}

export const ROW_HEIGHT = 36;
