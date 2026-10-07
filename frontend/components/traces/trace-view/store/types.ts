import type { SnippetInfo } from "@/lib/actions/traces/search";
import type { SpanEvent } from "@/lib/events/types";
import type { SpanType } from "@/lib/traces/types";

export type TraceViewSpan = {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  name: string;
  startTime: string;
  endTime: string;
  attributes: Record<string, any>;
  spanType: SpanType;
  path: string;
  events: SpanEvent[];
  status?: string;
  model?: string;
  pending?: boolean;
  collapsed: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  reasoningTokens?: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  aggregatedMetrics?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    cacheReadInputTokens?: number;
    reasoningTokens?: number;
    hasLLMDescendants: boolean;
  };
  inputSnippet?: SnippetInfo;
  outputSnippet?: SnippetInfo;
  attributesSnippet?: SnippetInfo;
};

export type TraceViewListSpan = {
  spanId: string;
  parentSpanId?: string;
  spanType: SpanType;
  name: string;
  model?: string;
  path: string;
  startTime: string;
  endTime: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  totalCost: number;
  pending?: boolean;
  status?: string;
  inputSnippet?: SnippetInfo;
  outputSnippet?: SnippetInfo;
  attributesSnippet?: SnippetInfo;
};

export type TranscriptListGroup = {
  type: "group";
  groupId: string;
  name: string;
  path: string;
  firstSpan: TraceViewListSpan;
  firstLlmSpanId: string | null;
  lastLlmSpanId: string | null;
  startTime: string;
  endTime: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  totalCost: number;
};

export type TranscriptGroupInput = {
  type: "group-input";
  groupId: string;
  firstLlmSpanId: string;
};

export type TranscriptGroupSpan = {
  type: "group-span";
  span: TraceViewListSpan;
  groupId: string;
  isLast: boolean;
};

export type TranscriptListEntry =
  | { type: "span"; span: TraceViewListSpan }
  | TranscriptListGroup
  | TranscriptGroupInput
  | TranscriptGroupSpan;
