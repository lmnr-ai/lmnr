import { getTracer } from "@lmnr-ai/lmnr";
import { generateText } from "ai";
import YAML from "yaml";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { getModel } from "@/lib/ai/llm";
import { SpanType } from "@/lib/clickhouse/types";

import { deduplicateSpanContent } from "./utils";


export const GetTraceSummaryUrlParamsSchema = z.object({
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  prompt: z.string().optional(),
});

export const GetTraceSummarySchema = z.object({
  ...GetTraceSummaryUrlParamsSchema.shape,
  projectId: z.string(),
  traceId: z.string(),
  apiKey: z.string(),
});

export const SpanSchema = z.object({
  span_id: z.string(),
  trace_id: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  parent_span_id: z.string(),
  name: z.string(),
  input: z.any(),
  output: z.any(),
  span_type: z.uint32(),
}).transform((span) => {
  let input = span.input;
  let output = span.output;
  try {
    input = JSON.parse(input);
  } catch { };
  try {
    output = JSON.parse(output);
  } catch { };
  return {
    spanId: span.span_id,
    traceId: span.trace_id,
    startTime: new Date(span.start_time).toISOString(),
    endTime: new Date(span.end_time).toISOString(),
    parentSpanId: span.parent_span_id,
    name: span.name,
    spanType: Object.entries(SpanType).find(([_, value]) => value === span.span_type)?.[0],
    input,
    output,
  };
});

const getTraceSpans = async (input: z.infer<typeof GetTraceSummarySchema>): Promise<z.infer<typeof SpanSchema>[]> => {
  const { projectId, traceId, startTime, endTime, apiKey } = input;

  const spans = await executeQuery({
    projectId,
    query: `
      SELECT * FROM spans
      WHERE trace_id = '${traceId}'
      AND start_time >= {start_time:DateTime(3)} - interval '1 second'
      AND start_time <= {end_time:DateTime(3)} + interval '1 second'
      ORDER BY start_time ASC
    `,
    apiKey,
    parameters: {
      start_time: startTime.replace("Z", ""),
      end_time: endTime.replace("Z", ""),
    },
  });

  return SpanSchema.array().parse(spans);
};


export const getTraceSummary = async (input: z.infer<typeof GetTraceSummarySchema>): Promise<string> => {
  const spans = await getTraceSpans(input);

  const deduplicatedSpans = deduplicateSpanContent(spans);

  const model = getModel();
  const prompt = `
  ${input.prompt ?? "Summarize the following trace."}
${YAML.stringify(deduplicatedSpans)}
`;

  const response = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    experimental_telemetry: {
      isEnabled: !!process.env.LMNR_PROJECT_API_KEY,
      tracer: getTracer(),
    },
    maxRetries: 0,
  });

  return response.text;
};
