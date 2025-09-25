import { tagClasses, traces } from "../db/migrations/schema";
import { Event } from "../events/types";

export type TagClass = typeof tagClasses.$inferSelect;

export type SpanTag = {
  id: string;
  createdAt: string;
  spanId: string;
  name: string;
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
  inputPreview: string;
  outputPreview: string;
  spanType: SpanType;
  events: Event[];
  path: string;
  model?: string;
  pending?: boolean;
  status?: string;
};

export type SpanRow = {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: string;
  endTime: string;
  inputPreview?: string;
  outputPreview?: string;
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

  inputCost: number;
  outputCost: number;
  totalCost: number;

  summary?: string;
  traceType: "DEFAULT" | "EVENT" | "EVALUATION" | "PLAYGROUND";
  sessionId?: string;
  metadata: Record<string, string>;
  userId?: string;
  status: string;
  tags: string[];
};

export type RealtimeTracePayload = {
  id: string;
  session_id: string | null;
  metadata: Record<string, any> | null;
  project_id: string;
  end_time: string | null;
  start_time: string | null;
  total_token_count: number;
  cost: number;
  created_at: string;
  trace_type: "DEFAULT" | "EVENT" | "EVALUATION" | "PLAYGROUND";
  input_token_count: number;
  output_token_count: number;
  input_cost: number;
  output_cost: number;
  has_browser_session: boolean | null;
  top_span_id: string | null;
  agent_session_id: string | null;
  visibility: string | null;
  status: string | null;
  user_id: string | null;
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

  inputCost: number;
  outputCost: number;
  totalCost: number;

  userId?: string;
};
