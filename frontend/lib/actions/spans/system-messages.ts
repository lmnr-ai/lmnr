import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { tryParseJson } from "@/lib/utils";
import { LangChainMessagesSchema, LangChainSystemMessageSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessagesSchema, OpenAISystemMessageSchema } from "@/lib/spans/types/openai";

export const GetSystemMessagesSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
});

export interface SystemMessageResponse {
  id: string;
  content: string;
  spanIds: string[];
}

/**
 * Extract system message content from a message object
 */
function extractSystemMessageContent(message: any): string | null {
  if (!message || typeof message !== "object") return null;

  // Check if it's a system message
  if (message.role !== "system") return null;

  // Extract content based on format
  if (typeof message.content === "string") {
    return message.content;
  }

  // Handle array content (OpenAI format with text parts)
  if (Array.isArray(message.content)) {
    const textParts = message.content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text);
    return textParts.join("\n");
  }

  return null;
}

/**
 * Try to parse input and extract system messages using zod schemas
 */
function parseSystemMessagesFromInput(input: string): string[] {
  const parsed = tryParseJson(input);
  if (!parsed) return [];

  const systemMessages: string[] = [];

  // Try OpenAI format
  try {
    const openAIResult = OpenAIMessagesSchema.safeParse(parsed);
    if (openAIResult.success) {
      for (const message of openAIResult.data) {
        const systemMsgResult = OpenAISystemMessageSchema.safeParse(message);
        if (systemMsgResult.success) {
          const content = extractSystemMessageContent(systemMsgResult.data);
          if (content) {
            systemMessages.push(content);
          }
        }
      }
      if (systemMessages.length > 0) return systemMessages;
    }
  } catch (e) {
    // Continue to try other formats
  }

  // Try LangChain format
  try {
    const langChainResult = LangChainMessagesSchema.safeParse(parsed);
    if (langChainResult.success) {
      for (const message of langChainResult.data) {
        const systemMsgResult = LangChainSystemMessageSchema.safeParse(message);
        if (systemMsgResult.success) {
          const content = extractSystemMessageContent(systemMsgResult.data);
          if (content) {
            systemMessages.push(content);
          }
        }
      }
      if (systemMessages.length > 0) return systemMessages;
    }
  } catch (e) {
    // Continue
  }

  return systemMessages;
}

/**
 * Fetch system messages from LLM spans in a trace
 */
export async function getTraceSystemMessages(
  input: z.infer<typeof GetSystemMessagesSchema>
): Promise<SystemMessageResponse[]> {
  const { projectId, traceId } = GetSystemMessagesSchema.parse(input);

  // Query only LLM spans with their inputs
  const query = `
    SELECT 
      span_id as spanId,
      input
    FROM spans
    WHERE trace_id = {traceId: UUID}
      AND span_type = 'LLM'
    ORDER BY start_time ASC
  `;

  const spans = await executeQuery<{ spanId: string; input: string }>({
    query,
    parameters: { projectId, traceId },
    projectId,
  });

  // Extract system messages and deduplicate
  const systemMessagesMap = new Map<string, { content: string; spanIds: string[] }>();

  for (const span of spans) {
    if (!span.input) continue;

    const systemMessages = parseSystemMessagesFromInput(span.input);

    for (const content of systemMessages) {
      // Use content as the key to deduplicate
      const existing = systemMessagesMap.get(content);
      if (existing) {
        // Add this span to the list of spans using this message
        if (!existing.spanIds.includes(span.spanId)) {
          existing.spanIds.push(span.spanId);
        }
      } else {
        // Create new system message entry
        systemMessagesMap.set(content, {
          content,
          spanIds: [span.spanId],
        });
      }
    }
  }

  // Convert map to array and add IDs
  return Array.from(systemMessagesMap.entries()).map(([content, data]) => ({
    id: content, // Using content as ID for deduplication
    content: data.content,
    spanIds: data.spanIds,
  }));
}

