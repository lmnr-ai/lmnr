import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { LangChainMessagesSchema, LangChainSystemMessageSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessagesSchema, OpenAISystemMessageSchema } from "@/lib/spans/types/openai";
import { tryParseJson } from "@/lib/utils";

export const GetSystemMessagesSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  paths: z.array(z.string()),
});

export interface SystemMessageResponse {
  id: string;
  content: string;
  path: string;
}

function extractSystemMessageContent(message: any): string | null {
  if (!message || typeof message !== "object") return null;
  if (message.role !== "system") return null;

  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    const textParts = message.content.filter((part: any) => part.type === "text").map((part: any) => part.text);
    return textParts.join("\n");
  }

  return null;
}

function parseSystemMessageFromInput(input: string): string | null {
  const parsed = tryParseJson(input);
  if (!parsed) return null;

  try {
    const openAIResult = OpenAIMessagesSchema.safeParse(parsed);
    if (openAIResult.success) {
      for (const message of openAIResult.data) {
        const systemMsgResult = OpenAISystemMessageSchema.safeParse(message);
        if (systemMsgResult.success) {
          const content = extractSystemMessageContent(systemMsgResult.data);
          if (content) return content;
        }
      }
    }
  } catch (e) {}

  try {
    const langChainResult = LangChainMessagesSchema.safeParse(parsed);
    if (langChainResult.success) {
      for (const message of langChainResult.data) {
        const systemMsgResult = LangChainSystemMessageSchema.safeParse(message);
        if (systemMsgResult.success) {
          const content = extractSystemMessageContent(systemMsgResult.data);
          if (content) return content;
        }
      }
    }
  } catch (e) {}

  return null;
}

export async function getTraceSystemMessages(
  input: z.infer<typeof GetSystemMessagesSchema>
): Promise<SystemMessageResponse[]> {
  const { projectId, traceId, paths } = GetSystemMessagesSchema.parse(input);

  if (paths.length === 0) {
    return [];
  }

  const query = `
    SELECT 
      span_id as spanId,
      input,
      path
    FROM spans
    WHERE trace_id = {traceId: UUID}
      AND span_type = 'LLM'
      AND path IN ({paths: Array(String)})
    ORDER BY start_time ASC
  `;

  const spans = await executeQuery<{ spanId: string; input: string; path: string }>({
    query,
    parameters: { projectId, traceId, paths },
    projectId,
  });

  const systemMessagesByPath = new Map<string, string>();

  for (const span of spans) {
    if (!span.input || !span.path) continue;
    if (systemMessagesByPath.has(span.path)) continue;

    const systemContent = parseSystemMessageFromInput(span.input);
    if (!systemContent) continue;

    systemMessagesByPath.set(span.path, systemContent);
  }

  return Array.from(systemMessagesByPath.entries()).map(([path, content], index) => ({
    id: `${path}_${index}`,
    content,
    path,
  }));
}
