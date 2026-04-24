import { type z } from "zod/v4";

import { type ParsedInput, type TextPart } from "@/lib/actions/sessions/parse-input";
import { GenAIMessagesSchema, looksLikeGenAIMessages } from "@/lib/spans/types/gen-ai";

import { type ProviderAdapter } from "./types";

type GenAIMessage = z.infer<typeof GenAIMessagesSchema>[number];
type GenAIPart = GenAIMessage["parts"][number];

// Collect text-like content from a GenAI parts array. Bare strings count as
// implicit text so payloads like `["Be helpful"]` (pydantic_ai's
// `system_instructions` shape preserved verbatim by the backend) parse too.
const extractGenAIText = (parts: GenAIPart[]): string[] => {
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      if (part.length > 0) out.push(part);
      continue;
    }
    const obj = part as { type?: string; content?: unknown };
    if (obj.type === "text" && typeof obj.content === "string" && obj.content.length > 0) {
      out.push(obj.content);
    }
  }
  return out;
};

const extractFirstUserMessage = (messages: GenAIMessage[]): TextPart[] => {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    return extractGenAIText(msg.parts).map((text) => ({ text }));
  }
  return [];
};

const parseSystemAndUserGenAI = (data: unknown): ParsedInput | null => {
  // The GenAI part schema has a catch-all record branch, so a bare Zod parse
  // would false-positive on Gemini/other shapes. `looksLikeGenAIMessages`
  // gates on at least one part carrying a GenAI `type` discriminator.
  if (!looksLikeGenAIMessages(data)) return null;
  const result = GenAIMessagesSchema.safeParse(data);
  if (!result.success) return null;
  const messages = result.data;

  let systemText: string | null = null;
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    const texts = extractGenAIText(systemMsg.parts);
    if (texts.length > 0) systemText = texts.join("\n");
  }

  return { systemText, userParts: extractFirstUserMessage(messages) };
};

export const genAIAdapter: ProviderAdapter = {
  id: "gen-ai",
  detect: (data) => looksLikeGenAIMessages(data),
  parseSystemAndUser: parseSystemAndUserGenAI,
};
