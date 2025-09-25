import { google } from '@ai-sdk/google';
import { getTracer, observe } from '@lmnr-ai/lmnr';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

import { clickhouseClient } from '@/lib/clickhouse/client';

import { getFullTraceForSummary } from './index';
import { TraceChatPromptSummaryPrompt } from './prompt';

export const TraceSummaryRequestSchema = z.object({
  traceId: z.string().describe('The trace ID to analyze'),
  traceStartTime: z.iso.datetime().describe('Start time of the trace'),
  traceEndTime: z.iso.datetime().describe('End time of the trace'),
  projectId: z.string().describe('The project ID'),
});

const TraceSummarySchema = z.object({
  summary: z.string().describe('A very concise summary to help user understand what the agent/LLM was tasked to do and what\'s going on in this trace'),
  status: z.string().describe('Either info, warning, or error. info - no need for detailed trace investigation. warning - trace is worth paying attention to, unusual behavior is identified. error - failure to properly follow the original prompt, trace definitely needs detailed investigation'),
  analysis: z.string().describe('Description of things worth investigating: logical failures, suboptimal tool calls, failure to properly follow the prompt, etc. If nothing of substance was detected, simply leave it as an empty string'),
  analysisPreview: z.string().describe('Single sentence to summarize why this trace needs attention. This sentence will be presented to the user to quickly identify traces worth looking at. This should not convey trace specific details, but rather high lever overview of core error or flaw, such: Logical error identified, wrong interpretation of information present on the screen. Empty string if attention is empty.'),
});

export async function getTraceSummary(input: z.infer<typeof TraceSummaryRequestSchema>): Promise<{ summary: string, spanIdsMap: Record<string, string> } | undefined> {
  const { traceId, projectId } = input;

  // Check ClickHouse for existing summary
  const result = await clickhouseClient.query({
    query: `
      SELECT 
        summary,
        status,
        analysis,
        analysis_preview as analysisPreview,
        span_ids_map as spanIdsMap
      FROM trace_summaries
      WHERE project_id = {projectId: UUID}
      AND trace_id = {traceId: UUID}
      LIMIT 1
    `,
    format: "JSONEachRow",
    query_params: {
      projectId,
      traceId,
    }
  });

  const data = await result.json<{
    summary: string;
    spanIdsMap: string;
  }>();

  if (data.length > 0) {
    const summaryData = data[0];
    return {
      summary: summaryData.summary || "",
      spanIdsMap: summaryData.spanIdsMap ? JSON.parse(summaryData.spanIdsMap) : {},
    };
  }

  return undefined;
}

export async function generateTraceSummary(input: z.infer<typeof TraceSummaryRequestSchema>): Promise<{ summary: string, spanIdsMap: Record<string, string> }> {
  const { traceId, traceStartTime, traceEndTime, projectId } = input;

  // Get the full trace data for summary
  const { stringifiedSpans, spanIdsMap } = await observe({ name: "getFullTraceForSummary" }, async () => await getFullTraceForSummary({
    projectId,
    traceId,
    startTime: traceStartTime,
    endTime: traceEndTime
  }));

  const summaryPrompt = TraceChatPromptSummaryPrompt.replace('{{fullTraceData}}', stringifiedSpans);

  const result = await generateObject({
    model: google('gemini-2.5-flash'),
    prompt: summaryPrompt,
    temperature: 0.5,
    schema: TraceSummarySchema,
    experimental_telemetry: {
      isEnabled: true,
      tracer: getTracer(),
    },
  });

  const { summary, status, analysis, analysisPreview } = result.object;


  // Insert into ClickHouse trace_summaries table
  await clickhouseClient.insert({
    table: 'trace_summaries',
    values: [{
      project_id: projectId,
      trace_id: traceId,
      summary: summary,
      status: status,
      analysis: analysis,
      analysis_preview: analysisPreview,
      span_ids_map: JSON.stringify(spanIdsMap),
    }],
    format: 'JSONEachRow',
    clickhouse_settings: {
      wait_for_async_insert: 0,
      async_insert: 1,
    }
  });

  return {
    summary,
    spanIdsMap,
  };

}

export async function generateOrGetTraceSummary(input: z.infer<typeof TraceSummaryRequestSchema>): Promise<{ summary: string, spanIdsMap: Record<string, string> }> {

  const existingSummary = await getTraceSummary(input);
  if (existingSummary) {
    return existingSummary;
  }

  return await generateTraceSummary(input);

}
