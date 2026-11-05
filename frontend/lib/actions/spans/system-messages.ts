import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";
import { extractSystemText } from "@/lib/spans/providers";

export const GetSystemMessagesSchema = z.object({
  projectId: z.guid(),
  traceId: z.guid(),
  paths: z.array(z.array(z.string())), // Array of path arrays
});

export interface SystemMessageResponse {
  id: string;
  content: string;
  path: string[]; // Return as array
}

/**
 * Extract system-message text from a SINGLE already-parsed message object.
 * Delegates to the provider registry by wrapping the message as a
 * single-item array, so any provider whose `parseSystemAndUser` can
 * recognise the shape (including OpenAI Responses' `input_text` parts and
 * Gemini's `parts` array) will be used automatically.
 */
export function extractSystemMessageContent(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  if ((message as { role?: unknown }).role !== "system") return null;
  return extractSystemText([message]);
}

/**
 * Extract system-message text from the full raw input JSON of an LLM
 * span. Goes through the provider registry which tries each known
 * message format in order.
 */
export function parseSystemMessageFromInput(input: string): string | null {
  const parsed = tryParseJson(input);
  if (!parsed) return null;
  return extractSystemText(parsed);
}

export async function getTraceSystemMessages(
  input: z.infer<typeof GetSystemMessagesSchema>
): Promise<SystemMessageResponse[]> {
  const { projectId, traceId, paths } = GetSystemMessagesSchema.parse(input);

  if (paths.length === 0) {
    return [];
  }

  // Convert path arrays to dot-joined strings for the query
  const pathStrings = paths.map((p) => p.join("."));

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
  paths.forEach((pathArray) => {
    pathMap.set(pathArray.join("."), pathArray);
  });

  for (const span of spans) {
    if (!span.input || !span.path) continue;
    if (systemMessagesByPath.has(span.path)) continue;

    const systemContent = parseSystemMessageFromInput(span.input);
    if (!systemContent) continue;

    // Get the original path array from our map
    const originalPath = pathMap.get(span.path) || span.path.split(".");
    systemMessagesByPath.set(span.path, { content: systemContent, path: originalPath });
  }

  return Array.from(systemMessagesByPath.entries()).map(([pathKey, { content, path }], index) => ({
    id: `${pathKey}_${index}`,
    content,
    path,
  }));
}
