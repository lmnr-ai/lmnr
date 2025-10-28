import YAML from "yaml";
import { z } from "zod/v4";

import { SpanType } from "@/lib/clickhouse/types";
import { convertToLocalTimeWithMillis } from "@/lib/utils";

import { getSpansData, getTraceStructure } from "./spans";

export const GetTraceStructureSchema = z.object({
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


export const getTraceStructureAsYAML = async (input: z.infer<typeof GetTraceStructureSchema>): Promise<string> => {
  const spans = await getTraceStructure(input);
  return YAML.stringify(spans);
};

export const getSpansDataAsYAML = async (input: z.infer<typeof GetTraceStructureSchema>, ids: number[]): Promise<string> => {
  const spans = await getSpansData(input, ids);
  return YAML.stringify(spans);
};

// Re-export summary functionality
export { generateOrGetTraceSummary as generateTraceSummary, GenerateTraceSummaryRequestSchema as TraceSummarySchema } from './summary';
