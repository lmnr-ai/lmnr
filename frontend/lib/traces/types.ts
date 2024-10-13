import { Event } from "../events/types";
import { GraphMessagePreview } from "../pipeline/types";

export type TraceMessages = { [key: string]: GraphMessagePreview }

export enum LabelType {
  CATEGORICAL = 'Categorical',
  BOOLEAN = 'Boolean',
}

export type LabelClass = {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  labelType: LabelType;
  valueMap: string[];
  description: string | null;
}

export type SpanLabel = {
  id: string;
  spanId: string;
  classId: string;
  createdAt: string;
  value: number;
  valueMap: string[];
  className: string;
  labelSource: 'Auto' | 'Manual';
  userEmail: string | null;
  description: string | null;
  updatedAt: string;
}

export enum SpanType {
  DEFAULT = "DEFAULT",
  LLM = "LLM",
  EXECUTOR = "EXECUTOR",
  EVALUATOR = "EVALUATOR",
  EVALUATION = "EVALUATION",
}

export type Span = {
  version: string
  spanId: string
  success: boolean
  parentSpanId?: string | null
  traceId: string
  name: string
  startTime: string
  endTime: string
  attributes: any
  metadata: any | null
  input: any | null
  output: any | null
  spanType: SpanType
  events: Event[]
}


export type TraceWithSpans = {
  id: string;
  startTime: string;
  endTime: string;
  success: boolean;
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
  metadata: Record<string, string> | null;
  projectId: string;
  spans: Span[];
}

export type Trace = {
  startTime: string;
  endTime: string;
  success: boolean;
  id: string;
  sessionId: string;
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
  metadata: Record<string, string> | null;
  parentSpanInput: any | null;
  parentSpanOutput: any | null;
  parentSpanName: string | null;
  parentSpanType: SpanType | null;
  events: TraceEvent[]
}

export type TraceEvent = {
  id: string;
  templateName: string;
  templateId: string;
}

export type RunTrace = TracePreview & { messagePreviews: TraceMessages }
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
}

export type TraceMetricDatapoint = {
  // epoch seconds
  time: number;
  value: number;
}

export type SessionPreview = {
  id: string;
  traceCount: number;
  inputCost: number;
  outputCost: number;
  cost: number;
  startTime: string;
  endTime: string;
  duration: number;
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
}

export enum ExportableSpanColumns {
  SpanId = 'spanId',
  Name = 'name',
  TraceId = 'traceId',
  StartTime = 'startTime',
  EndTime = 'endTime',
  ParentSpanId = 'parentSpanId',
  Input = 'input',
  Output = 'output',
  SpanType = 'spanType',
}
