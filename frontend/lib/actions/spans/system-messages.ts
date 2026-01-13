import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";
import { LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessagesSchema } from "@/lib/spans/types/openai";
export const GetSystemMessagesSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  paths: z.array(z.array(z.string())),  // Array of path arrays
});

export interface SystemMessageResponse {
  id: string;
  content: string;
  path: string[];  // Return as array
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
        const content = extractSystemMessageContent(message);
        if (content) return content;
      }
    }
  } catch (e) {}

  try {
    const langChainResult = LangChainMessagesSchema.safeParse(parsed);
    if (langChainResult.success) {
      for (const message of langChainResult.data) {
        const content = extractSystemMessageContent(message);
        if (content) return content;
      }
    }
  } catch (e) {}

  try {
    if (Array.isArray(parsed)) {
      for (const message of parsed) {
        if (message && typeof message === "object" && message.role === "system") {
          const content = extractSystemMessageContent(message);
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

  // Convert path arrays to dot-joined strings for the query
  const pathStrings = paths.map(p => p.join('.'));

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
    parameters: { projectId, traceId, paths: pathStrings },
    projectId,
  });

  const systemMessagesByPath = new Map<string, { content: string; path: string[] }>();

  // Create a map of dot-joined path -> original path array
  const pathMap = new Map<string, string[]>();
  paths.forEach(pathArray => {
    pathMap.set(pathArray.join('.'), pathArray);
  });

  for (const span of spans) {
    if (!span.input || !span.path) continue;
    if (systemMessagesByPath.has(span.path)) continue;

    const systemContent = parseSystemMessageFromInput(span.input);
    if (!systemContent) continue;

    // Get the original path array from our map
    const originalPath = pathMap.get(span.path) || span.path.split('.');
    systemMessagesByPath.set(span.path, { content: systemContent, path: originalPath });
  }

  return Array.from(systemMessagesByPath.entries()).map(([pathKey, { content, path }], index) => ({
    id: `${pathKey}_${index}`,
    content,
    path,
  }));
}
