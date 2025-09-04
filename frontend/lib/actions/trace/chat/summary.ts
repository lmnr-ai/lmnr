import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { z } from 'zod';
import { getTracer } from '@lmnr-ai/lmnr';

import { cache, TRACE_SUMMARIES_CACHE_KEY } from '@/lib/cache';
import { getFullTraceForSummary } from './index';
import { TraceChatPrompt } from './prompt';

export const TraceSummarySchema = z.object({
  traceId: z.string().describe('The trace ID to analyze'),
  traceStartTime: z.string().datetime().describe('Start time of the trace'),
  traceEndTime: z.string().datetime().describe('End time of the trace'),
  projectId: z.string().describe('The project ID'),
});

export async function generateTraceSummary(input: z.infer<typeof TraceSummarySchema>) {
  const { traceId, traceStartTime, traceEndTime, projectId } = input;

  // Check cache first
  const cacheKey = `${TRACE_SUMMARIES_CACHE_KEY}:${projectId}:${traceId}`;
  const cachedSummary = await cache.get<{
    summary: string;
    usage: any;
    finishReason: string;
  }>(cacheKey);

  if (cachedSummary) {
    return cachedSummary;
  }

  // Get the full trace data for summary
  const fullTraceData = await getFullTraceForSummary({
    projectId,
    traceId,
    startTime: traceStartTime,
    endTime: traceEndTime
  });

  // Create a summary-focused prompt
  const summaryPrompt = `You are an expert in analyzing traces of LLM powered applications, such as chatbots, AI agents, etc.

Please provide a concise trace summary with a goal to provide true trace insights to user with a minimum text to read. Focus on:
- Overall execution flow and key LLM interactions
- LLM logical errors, such as failure to fully follow the initial prompt or suboptimal tool calls, that stems from misunderstanding of task or failure to adhere to prompt.
- Relevant application level exceptions.

Remember that your goal is to help a user very quickly understands what's happening in the trace and which spans are worth looking at in more details.

It's also useful to reference specific spans by id. When referencing spans, use the following format:
[span id]("specific text in span input/output").

For the final answer use the following format:
<lmnr_summary>
very concise summary to help user understand what's going on in this trace
</lmnr_summary>
<lmnr_attention>
things users need to investigate, such logical failures, suboptimal tool calls and so on
</lmnr_attention>

Here's the complete trace data with all spans:
<trace>
${fullTraceData}
</trace>`;

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: summaryPrompt,
    temperature: 0.5,
    experimental_telemetry: {
      isEnabled: true,
      tracer: getTracer(),
    },
  });

  const summaryResult = {
    summary: result.text,
    usage: result.usage,
    finishReason: result.finishReason,
  };

  // Cache the result for 1 hour
  await cache.set(cacheKey, summaryResult, 'EX', 60 * 60);

  return summaryResult;
}
