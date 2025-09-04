import YAML from "yaml";
import { z } from "zod/v4";

import { SpanType } from "@/lib/clickhouse/types";
import { convertToLocalTimeWithMillis } from "@/lib/utils";

import { getFullTraceSpans, getSpansDataFromCache, getTraceStructureFromCache } from "./cache";

export const GetTraceStructureSchema = z.object({
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  projectId: z.string(),
  traceId: z.string(),
});

export const SpanSchema = z.object({
  span_id: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  parent_span_id: z.string(),
  name: z.string(),
  span_type: z.uint32(),
}).transform((span) => ({
  spanId: span.span_id,
  start: convertToLocalTimeWithMillis(span.start_time),
  end: convertToLocalTimeWithMillis(span.end_time),
  parent: span.parent_span_id,
  name: span.name,
  type: Object.entries(SpanType).find(([_, value]) => value === span.span_type)?.[0],
}));


export const getTraceStructure = async (input: z.infer<typeof GetTraceStructureSchema>): Promise<string> => {
  const spans = await getTraceStructureFromCache(input);
  return YAML.stringify(spans);
};

export const getSpansData = async (input: z.infer<typeof GetTraceStructureSchema>, ids: number[]): Promise<string> => {
  const spans = await getSpansDataFromCache(input, ids);
  return YAML.stringify(spans);
};

export const getFullTraceForSummary = async (input: z.infer<typeof GetTraceStructureSchema>): Promise<string> => {
  const spans = await getFullTraceSpans(input);

  const spanIdToId = spans.reduce((acc, span, index) => {
    acc[span.spanId] = index + 1;
    return acc;
  }, {} as Record<string, number>);

  const strippedSpans = spans.map((span, index) => ({
    id: index + 1,
    input: span.input,
    output: span.output,
    parent: spanIdToId[span.parent],
    status: span.status,
    name: span.name,
    type: span.type,
    start: span.start,
    end: span.end,
  }));
  return JSON.stringify(strippedSpans, null, 2);
};

// Re-export summary functionality
export { generateTraceSummary, TraceSummarySchema } from './summary';
