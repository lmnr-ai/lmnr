import { tool } from 'ai';
import { and, desc,eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/drizzle';
import { tracesAgentChats, tracesAgentMessages } from '@/lib/db/migrations/schema';

export const ChatMessageSchema = z.object({
  traceId: z.string().describe('The trace ID'),
  projectId: z.string().describe('The project ID'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().optional(),
    parts: z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
      toolCallId: z.string().optional(),
      input: z.any().optional(),
      output: z.any().optional(),
      callProviderMetadata: z.any().optional(),
    })).optional(),
  })).describe('The conversation messages'),
  traceStartTime: z.iso.datetime().describe('Start time of the trace'),
  traceEndTime: z.iso.datetime().describe('End time of the trace'),
});

export const GetChatMessagesSchema = z.object({
  traceId: z.string().describe('The trace ID'),
  projectId: z.string().describe('The project ID'),
});

export async function getChatMessages(input: z.infer<typeof GetChatMessagesSchema>) {
  const { traceId, projectId } = input;

  // Find the latest chat record for this trace
  const chatRecord = await db
    .select()
    .from(tracesAgentChats)
    .where(and(
      eq(tracesAgentChats.traceId, traceId),
      eq(tracesAgentChats.projectId, projectId)
    ))
    .orderBy(desc(tracesAgentChats.createdAt))
    .limit(1);

  if (chatRecord.length === 0) {
    // No chat exists yet, return empty messages
    return { messages: [] };
  }

  const chatId = chatRecord[0].id;

  // Fetch all messages for this chat
  const messages = await db
    .select()
    .from(tracesAgentMessages)
    .where(and(
      eq(tracesAgentMessages.chatId, chatId),
      eq(tracesAgentMessages.projectId, projectId)
    ))
    .orderBy(tracesAgentMessages.createdAt);

  return { messages: messages };
}

// for now, we only support one chat per trace and we create a new one if it doesn't exist
export async function findOrCreateChatSession(traceId: string, projectId: string): Promise<string> {
  // Find the latest chat record for this trace
  let chatRecord = await db
    .select()
    .from(tracesAgentChats)
    .where(and(
      eq(tracesAgentChats.traceId, traceId),
      eq(tracesAgentChats.projectId, projectId)
    ))
    .orderBy(desc(tracesAgentChats.createdAt))
    .limit(1);

  if (chatRecord.length === 0) {
    // Create new chat record
    const newChat = await db
      .insert(tracesAgentChats)
      .values({
        traceId: traceId,
        projectId: projectId,
      })
      .returning();
    return newChat[0].id;
  }

  return chatRecord[0].id;
}

export async function saveChatMessage(params: {
  chatId: string;
  traceId: string;
  projectId: string;
  role: 'user' | 'assistant' | 'tool';
  parts: any;
}) {
  const { chatId, traceId, projectId, role, parts } = params;

  await db.insert(tracesAgentMessages).values({
    role,
    parts,
    chatId,
    traceId,
    projectId,
  });
}

export async function createGetSpansDataTool(projectId: string, traceId: string, requestUrl: string, cookies: string) {
  return tool({
    description: 'Get spans data for the current trace to analyze performance, errors, and execution flow',
    inputSchema: z.object({
      traceId: z.string().describe('The trace ID to get spans for'),
      filters: z.object({
        spanType: z.string().optional().describe('Filter by span type (LLM or DEFAULT)'),
        hasErrors: z.boolean().optional().describe('Filter spans with errors'),
        minDuration: z.number().optional().describe('Minimum duration in ms'),
      }).optional().describe('Optional filters for spans'),
    }),
    execute: async ({ traceId: toolTraceId, filters }) => {
      try {
        // Build the spans API URL
        const spansUrl = new URL(`/api/projects/${projectId}/traces/${toolTraceId}/spans`, requestUrl);

        // Add filters as query parameters
        if (filters?.spanType) {
          spansUrl.searchParams.set('spanType', filters.spanType);
        }
        if (filters?.hasErrors) {
          spansUrl.searchParams.set('hasErrors', 'true');
        }
        if (filters?.minDuration) {
          spansUrl.searchParams.set('minDuration', filters.minDuration.toString());
        }

        // Fetch spans data using the existing API
        const response = await fetch(spansUrl.toString(), {
          headers: {
            'Cookie': cookies,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch spans: ${response.statusText}`);
        }

        const spans = await response.json();

        // Process and summarize the spans data
        const summary = {
          totalSpans: spans.length,
          spanTypes: [...new Set(spans.map((s: any) => s.spanType))],
          totalDuration: spans.length > 0 ?
            new Date(Math.max(...spans.map((s: any) => new Date(s.endTime).getTime()))).getTime() -
            new Date(Math.min(...spans.map((s: any) => new Date(s.startTime).getTime()))).getTime()
            : 0,
          errorCount: spans.filter((s: any) => s.status === 'ERROR' || s.attributes?.['error.message']).length,
          llmSpans: spans.filter((s: any) => s.spanType === 'LLM'),
          tokenUsage: spans.reduce((acc: any, span: any) => {
            const inputTokens = span.attributes?.['gen_ai.usage.input_tokens'] || 0;
            const outputTokens = span.attributes?.['gen_ai.usage.output_tokens'] || 0;
            return {
              input: acc.input + inputTokens,
              output: acc.output + outputTokens,
              total: acc.total + inputTokens + outputTokens,
            };
          }, { input: 0, output: 0, total: 0 }),
          costs: spans.reduce((acc: number, span: any) => {
            const inputCost = span.attributes?.['gen_ai.usage.input_cost'] || 0;
            const outputCost = span.attributes?.['gen_ai.usage.output_cost'] || 0;
            return acc + inputCost + outputCost;
          }, 0),
        };

        return {
          summary,
          spans: spans.slice(0, 10), // Return first 10 spans for detailed analysis
        };
      } catch (error) {
        console.error('Error fetching spans data:', error);
        return {
          error: 'Failed to fetch spans data',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });
}
