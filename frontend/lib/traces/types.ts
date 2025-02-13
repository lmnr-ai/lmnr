import { labelClasses } from '../db/migrations/schema';
import { Event } from '../events/types';
import { GraphMessagePreview } from '../pipeline/types';

export type TraceMessages = { [key: string]: GraphMessagePreview };

export enum LabelSource {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL'
}

export type LabelClass = {
  valueMap: Record<string, number>;
  evaluatorRunnableGraph: any;
  pipelineVersionId?: string | null;
} & typeof labelClasses.$inferSelect;

export type RegisteredLabelClassForPath = {
  id: string;
  labelClassId: string;
  path: string;
  projectId: string;
  createdAt: string;
};

export type SpanLabel = {
  id: string;
  spanId: string;
  classId: string;
  createdAt: string;
  value: number;
  valueMap: Record<string, number>;
  status: string;
  userId: string | null;
  jobStatus: string | null;
  className: string;
  reasoning: string | null;
  labelSource: LabelSource;
  userEmail: string | null;
  description: string | null;
  updatedAt: string;
};

export enum SpanType {
  DEFAULT = 'DEFAULT',
  LLM = 'LLM',
  EXECUTOR = 'EXECUTOR',
  EVALUATOR = 'EVALUATOR',
  EVALUATION = 'EVALUATION',
  TOOL = 'TOOL'
}

export type Span = {
  spanId: string;
  parentSpanId?: string | null;
  traceId: string;
  name: string;
  startTime: string;
  endTime: string;
  attributes: Record<string, any>;
  input: any | null;
  output: any | null;
  inputPreview: string | null;
  outputPreview: string | null;
  spanType: SpanType;
  events: Event[];
  labels: SpanLabel[];
  path: string;
  model?: string;
  inputUrl: string | null;
  outputUrl: string | null;
};

export type SpanPreview = Omit<Span, 'labels'>;

export type TraceWithSpans = {
  id: string;
  startTime: string;
  endTime: string;
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
  metadata: Record<string, string> | null;
  hasBrowserSession: boolean | null;
  projectId: string;
  spans: Omit<Span, 'labels'>[];
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
  topSpanInputPreview: any | null;
  topSpanOutputPreview: any | null;
  topSpanName: string | null;
  topSpanType: SpanType | null;
  topSpanPath: string | null;
  hasBrowserSession: boolean | null;
  // events: TraceEvent[];
};

export type TraceEvent = {
  id: string;
  templateName: string;
  templateId: string;
};

export type RunTrace = TracePreview & { messagePreviews: TraceMessages };
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

export type TraceMetricDatapoint = {
  // epoch seconds
  time: number;
  value: number;
};

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
};

export enum ExportableSpanColumns {
  SpanId = 'spanId',
  Name = 'name',
  TraceId = 'traceId',
  StartTime = 'startTime',
  EndTime = 'endTime',
  ParentSpanId = 'parentSpanId',
  Input = 'input',
  Output = 'output',
  SpanType = 'spanType'
}

export type TraceSearchResponse = {
  traceIds: string[];
  spanIds: string[];
};
