import { google } from '@ai-sdk/google';
import { getTracer } from '@lmnr-ai/lmnr';
import { convertToModelMessages, smoothStream, stepCountIs, streamText, tool, UIMessage } from 'ai';
import { z } from 'zod';

import { generateTraceSummary, getSpansDataAsYAML, getTraceStructureAsYAML } from './index';
import { findOrCreateChatSession, saveChatMessage } from './messages';
import { TraceChatPrompt } from './prompt';

export const TraceStreamChatSchema = z.object({
  messages: z.array(z.any()).describe('Array of UI messages'),
  traceId: z.string().describe('The trace ID to analyze'),
  traceStartTime: z.iso.datetime().describe('Start time of the trace'),
  traceEndTime: z.iso.datetime().describe('End time of the trace'),
  projectId: z.string().describe('The project ID'),
});

export async function streamTraceChat(input: z.infer<typeof TraceStreamChatSchema>) {
  const { messages: uiMessages, traceId, traceStartTime, traceEndTime, projectId } = input;

  const chatId = await findOrCreateChatSession(traceId, projectId);

  const userMessage = uiMessages.filter((message) => message.role === 'user').at(-1);

  await saveChatMessage({
    chatId,
    traceId,
    projectId,
    role: 'user',
    parts: userMessage?.parts,
  });

  const { summary, status, analysis, analysisPreview } = await generateTraceSummary({
    traceId,
    traceStartTime,
    traceEndTime,
    projectId,
  });

  const traceStructure = await getTraceStructureAsYAML({
    projectId,
    traceId,
    startTime: traceStartTime,
    endTime: traceEndTime
  });

  const prompt = TraceChatPrompt
    .replace('{{structure}}', traceStructure)
    .replace('{{summary}}', summary)
    .replace('{{analysis}}', analysis);

  const result = streamText({
    model: google('gemini-2.5-flash'),
    messages: convertToModelMessages(uiMessages as UIMessage[]),
    stopWhen: stepCountIs(10),
    system: prompt,
    tools: {
      getSpansData: tool({
        description: 'Get the data (input, output, start time, end time, status, events) of spans in the trace by span ids',
        inputSchema: z.object({
          spanIds: z.array(z.int()).describe('List of span ids to get the data for'),
        }),
        execute: async ({ spanIds }) => {
          const spansData = await getSpansDataAsYAML({
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
