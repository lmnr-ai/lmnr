import { Event } from "../events/types";
import { GraphMessagePreview } from "../pipeline/types"

export type TraceMessages = { [key: string]: GraphMessagePreview }

export type TagType = {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
}

export type TraceTag = {
  id: string;
  runId: string;
  typeId: string;
  createdAt: string;
  // value cannot be null or empty string, if you want this value, then delete the tag
  value: string;
}

export type TraceTagWithTypeName = TraceTag & { typeName: string }

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
  spanType: string
  events: Event[]
}


export type TraceWithSpans = {
  id: string;
  startTime: string;
  endTime: string;
  success: boolean;
  totalTokenCount: number;
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
  totalTokenCount: number;
  cost: number | null;
  metadata: Record<string, string> | null;
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
  totalTokenCount: number;
  approximateCost: number | null;
  metadata: Record<string, string> | null;
  outputMessageIds: string[];
}

export type TraceMetricDatapoint = {
  // epoch seconds
  time: number;
  value: number;
}
