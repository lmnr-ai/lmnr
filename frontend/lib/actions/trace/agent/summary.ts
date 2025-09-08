import { google } from '@ai-sdk/google';
import { getTracer } from '@lmnr-ai/lmnr';
import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/drizzle';
import { tracesSummaries } from '@/lib/db/migrations/schema';

import { getFullTraceForSummary } from './index';
import { TraceChatPromptSummaryPrompt } from './prompt';

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
  const summaryPrompt = TraceChatPromptSummaryPrompt.replace('{{fullTraceData}}', fullTraceData);

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
