import { google } from '@ai-sdk/google';
import { convertToModelMessages, smoothStream, stepCountIs, streamText, tool, UIMessage } from 'ai';
import { z } from 'zod';
import { getTracer } from '@lmnr-ai/lmnr';

import { generateTraceSummary, getSpansData, getTraceStructure } from './index';
import { TraceChatPrompt } from './prompt';

export const TraceStreamChatSchema = z.object({
  messages: z.array(z.any()).describe('Array of UI messages'),
  traceId: z.string().describe('The trace ID to analyze'),
  traceStartTime: z.string().datetime().describe('Start time of the trace'),
  traceEndTime: z.string().datetime().describe('End time of the trace'),
  projectId: z.string().describe('The project ID'),
});

export async function streamTraceChat(input: z.infer<typeof TraceStreamChatSchema>) {
  const { messages, traceId, traceStartTime, traceEndTime, projectId } = input;

  const summary = await generateTraceSummary({
    traceId,
    traceStartTime,
    traceEndTime,
    projectId,
  });

  const traceStructure = await getTraceStructure({
    projectId,
    traceId,
    startTime: traceStartTime,
    endTime: traceEndTime
  });

  const prompt = TraceChatPrompt
    .replace('{{structure}}', traceStructure)
    .replace('{{summary}}', summary.summary);

  const result = streamText({
    model: google('gemini-2.5-flash'),
    messages: convertToModelMessages(messages as UIMessage[]),
    stopWhen: stepCountIs(10),
    system: prompt,
    tools: {
      getSpansData: tool({
        description: 'Get the data of spans in the trace by span ids',
        inputSchema: z.object({
          spanIds: z.array(z.int()).describe('List of span ids to get the data for'),
        }),
        execute: async ({ spanIds }) => {
          const spansData = await getSpansData({
            projectId,
            traceId,
            startTime: traceStartTime,
            endTime: traceEndTime
          }, spanIds);
          return spansData;
        },
      }),
    },
    experimental_transform: smoothStream(),
    experimental_telemetry: {
      isEnabled: true,
      tracer: getTracer(),
    },
  });

  return result;
}
