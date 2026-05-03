import { tryParseJson } from "@/lib/actions/common/utils";
import { PROVIDERS } from "@/lib/spans/providers";

export type TextPart = { text: string };

export interface ParsedInput {
  systemText: string | null;
  userParts: TextPart[];
}

/**
 * Build a synthetic messages array from the first and last elements
 * extracted by ClickHouse, then parse into typed system + user parts.
 * The first element is typically the system message (arr[1]) and the
 * last element is the most recent user message (arr[length(arr)]).
 */
export function parseExtractedMessages(firstMessage: string, lastMessage: string): ParsedInput | null {
  const parts: string[] = [];
  if (firstMessage) parts.push(firstMessage);
  if (lastMessage) parts.push(lastMessage);
  if (parts.length === 0) return null;

  const syntheticJson = `[${parts.join(",")}]`;
  const parsed = tryParseJson(syntheticJson);
  if (!parsed) return null;

  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return tryParseMessages(arr);
}

function tryParseMessages(arr: unknown[]): ParsedInput | null {
  for (const adapter of PROVIDERS) {
    const parsed = adapter.parseSystemAndUser?.(arr);
    if (parsed) return parsed;
  }
  return null;
}
