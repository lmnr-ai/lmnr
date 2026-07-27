import { type tagClasses, type traces } from "../db/migrations/schema";
import { type SpanEvent } from "../events/types";

export type TagClass = typeof tagClasses.$inferSelect;

export type SpanTag = {
  id: string;
  name: string;
  createdAt?: string;
  spanId?: string;
  email?: string;
  color?: string;
};

export enum SpanType {
  DEFAULT = "DEFAULT",
  LLM = "LLM",
  EXECUTOR = "EXECUTOR",
  EVALUATOR = "EVALUATOR",
  EVALUATION = "EVALUATION",
  TOOL = "TOOL",
  HUMAN_EVALUATOR = "HUMAN_EVALUATOR",
  EVENT = "EVENT",
  CACHED = "CACHED",
}

export type RealtimeSpan = {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  spanType: SpanType;
  name: string;
  startTime: string;
  endTime: string;
  attributes: Record<string, any>;
  status?: string;
  projectId: string;
  createdAt: string;
};

export type Span = {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  name: string;
  startTime: string;
  endTime: string;
  attributes: Record<string, any>;
  input: any;
  output: any;
  inputPreview?: string;
  outputPreview?: string;
  spanType: SpanType;
  events: SpanEvent[];
  path: string;
  model?: string;
  pending?: boolean;
  status?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  reasoningTokens?: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  /**
   * Deduped tool definitions reconstructed from `deduped_content_dict` by
   * `spans_v0` (camelCased from the view's `tool_definitions` column).
   * Empty string when the span has no tools or for legacy spans whose
   * definitions still ride in the attributes blob — the frontend's
   * `extractToolsFromAttributes` is the fallback.
   */
  toolDefinitions?: string;
};

export type SpanRow = {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: string;
  endTime: string;
  spanType: SpanType;

  totalCost: number;
  inputCost: number;
  outputCost: number;

  totalTokens: number;
  inputTokens: number;
  outputTokens: number;

  path: string;
  duration: number;
  model?: string;
  status?: string;
  tags: string[];
};

export type Trace = {
  startTime: string;
  endTime: string;
  id: string;
  sessionId: string;
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
  metadata: Record<string, string> | null;
  topSpanId: string | null;
  topSpanInputPreview: any | null;
  topSpanOutputPreview: any | null;
  topSpanName: string | null;
  topSpanType: SpanType | null;
  hasBrowserSession: boolean | null;
  traceType: (typeof traces.$inferSelect)["traceType"] | null;
  visibility?: string;
  status: string | null;
  userId: string | null;
};

// Client-safe aggregate of one signal's events on a trace, rendered as a chip
// in the traces table. Built server-side by getTraceRowSignals.
export type TraceRowSignal = {
  signalId: string;
  signalName: string;
  eventCount: number;
  maxSeverity: number;
  clusterId: string | null;
  clusterName: string | null;
  /** Non-empty per-event summaries, latest first (tooltip content). */
  summaries: string[];
};

export type TraceRow = {
  id: string;
  startTime: string;
  endTime: string;

  topSpanName?: string;
  topSpanId?: string;
  topSpanType?: SpanType;

  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningTokens?: number;

  inputCost: number;
  outputCost: number;
  totalCost: number;

  traceType: "DEFAULT" | "EVENT" | "EVALUATION" | "PLAYGROUND";
  sessionId?: string;
  metadata: Record<string, string>;
  userId?: string;
  status: string;
  spanTags: string[];
  traceTags: string[];
  rootSpanInput?: string;
  rootSpanOutput?: string;
  inputSnippet?: { text: string; highlight: [number, number] };
  outputSnippet?: { text: string; highlight: [number, number] };
  attributesSnippet?: { text: string; highlight: [number, number] };
  snippetsCount?: number;
  /** Populated server-side when Feature.SIGNALS is on; absent on realtime rows. */
  signals?: TraceRowSignal[];
};

// Wire shape of one trace in a `trace_update` SSE event — mirrors the Rust
// `RealtimeTrace` struct (app-server/src/traces/realtime.rs), camelCase serde.
export type RealtimeTracePayload = {
  id: string;
  startTime: string | null;
  endTime: string | null;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  reasoningTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  metadata: Record<string, any> | null;
  topSpanId: string | null;
  traceType: "DEFAULT" | "EVENT" | "EVALUATION" | "PLAYGROUND";
  topSpanName: string | null;
  topSpanType: string | null;
  status: string | null;
  userId: string | null;
  tags: string[];
  rootSpanInput: string | null;
  rootSpanOutput: string | null;
};

export type TracePreview = {
  startTime: string;
  endTime: string;
  success: boolean;
  id: string;
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  approximateCost: number | null;
  metadata: Record<string, string> | null;
  outputMessageIds: string[];
};

// We have id and sessionId here because
// its not possible to make good type intersection,
// and use it in tanstack table wrappers.
export type SessionRow = {
  id: string;
  sessionId: string;
  subRows: TraceRow[];

  traceCount?: number;
  startTime: string;
  endTime: string;
  duration: number;

  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;

  inputCost: number;
  outputCost: number;
  totalCost: number;

  userId?: string;
};
