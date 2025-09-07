import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { z } from 'zod';
import { getTracer } from '@lmnr-ai/lmnr';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { tracesSummaries } from '@/lib/db/migrations/schema';
import { getFullTraceForSummary } from './index';

export const TraceSummarySchema = z.object({
  traceId: z.string().describe('The trace ID to analyze'),
  traceStartTime: z.iso.datetime().describe('Start time of the trace'),
  traceEndTime: z.iso.datetime().describe('End time of the trace'),
  projectId: z.string().describe('The project ID'),
});

export async function generateTraceSummary(input: z.infer<typeof TraceSummarySchema>): Promise<string> {
  const { traceId, traceStartTime, traceEndTime, projectId } = input;

  // Check database for existing summary
  const existingSummary = await db
    .select()
    .from(tracesSummaries)
    .where(eq(tracesSummaries.traceId, traceId))
    .limit(1);

  if (existingSummary.length > 0 && existingSummary[0].summary) {
    return (existingSummary[0].summary) || "";
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

It's also useful to reference specific text in spans. When referencing spans, format is as a code block:
<span_reference_format>
\`span_id: <span_id>, span_name: <span_name>, text: <specific text to reference in span input/output>\`.

For example: \`span_id:29,span_name:openai.chat,text:Added a new column definition for sessionId\`
</span_reference_format>

For the final answer use the following format:
<format>
<Very concise summary to help user understand what's going on in this trace>
---
<Possible things users need to investigate, such logical failures, suboptimal tool calls and so on >
</format>

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

  const summary = result.text;

  if (existingSummary.length > 0) {
    // Update existing record
    await db
      .update(tracesSummaries)
      .set({
        summary: summary,
      })
      .where(eq(tracesSummaries.traceId, traceId));
  } else {
    // Create new record
    await db
      .insert(tracesSummaries)
      .values({
        traceId: traceId,
        summary: summary,
        projectId: projectId,
      });
  }

  return summary;
}
