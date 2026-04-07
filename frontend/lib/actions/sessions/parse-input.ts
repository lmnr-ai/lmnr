import { type z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { type AnthropicContentBlockSchema, AnthropicMessagesSchema } from "@/lib/spans/types/anthropic";
import { GeminiContentsSchema, type GeminiTextPartSchema } from "@/lib/spans/types/gemini";
import { OpenAIMessagesSchema, type OpenAITextPartSchema } from "@/lib/spans/types/openai";

export type TextPart = { text: string };

export interface ParsedInput {
  systemText: string | null;
  userParts: TextPart[];
}

/**
 * Build a synthetic messages array from the first and last elements
 * extracted by ClickHouse, then parse into typed system + user parts.
 */
export function parseExtractedMessages(firstMessage: string, lastMessage: string): ParsedInput | null {
  const parts: string[] = [];
  if (firstMessage) parts.push(firstMessage);
  if (lastMessage) parts.push(lastMessage);
  if (parts.length === 0) return null;

  const syntheticJson = `[${parts.join(",")}]`;
  return parseMessagesArray(syntheticJson);
}

/**
 * Try OpenAI, Anthropic, and Gemini schemas in order.
 */
function parseMessagesArray(json: string): ParsedInput | null {
  const parsed = tryParseJson(json);
  if (!parsed) return null;

  const arr = Array.isArray(parsed) ? parsed : [parsed];

  const openai = OpenAIMessagesSchema.safeParse(arr);
  if (openai.success) return extractFromOpenAI(openai.data);

  const anthropic = AnthropicMessagesSchema.safeParse(arr);
  if (anthropic.success) return extractFromAnthropic(anthropic.data);

  const gemini = GeminiContentsSchema.safeParse(arr);
  if (gemini.success) return extractFromGemini(gemini.data);

  return null;
}

function extractFromOpenAI(messages: z.infer<typeof OpenAIMessagesSchema>): ParsedInput {
  let systemText: string | null = null;
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    if (typeof systemMsg.content === "string") {
      systemText = systemMsg.content;
    } else {
      const textParts = systemMsg.content
        .filter((p): p is z.infer<typeof OpenAITextPartSchema> => p.type === "text")
        .map((p) => p.text);
      if (textParts.length > 0) systemText = textParts.join("\n");
    }
  }

  return { systemText, userParts: extractLastUserMessageOpenAI(messages) };
}

function extractLastUserMessageOpenAI(messages: z.infer<typeof OpenAIMessagesSchema>): TextPart[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    if (typeof msg.content === "string") return [{ text: msg.content }];

    return msg.content
      .filter((p): p is z.infer<typeof OpenAITextPartSchema> => p.type === "text")
      .map((p) => ({ text: p.text }));
  }
  return [];
}

function extractFromAnthropic(messages: z.infer<typeof AnthropicMessagesSchema>): ParsedInput {
  let systemText: string | null = null;
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    if (typeof systemMsg.content === "string") {
      systemText = systemMsg.content;
    } else {
      const textBlocks = (systemMsg.content as z.infer<typeof AnthropicContentBlockSchema>[]).filter(
        (b): b is { type: "text"; text: string } => b.type === "text"
      );
      if (textBlocks.length > 0) systemText = textBlocks.map((b) => b.text).join("\n");
    }
  }

  return { systemText, userParts: extractLastUserMessageAnthropic(messages) };
}

function extractLastUserMessageAnthropic(messages: z.infer<typeof AnthropicMessagesSchema>): TextPart[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    if (typeof msg.content === "string") return [{ text: msg.content }];

    return (msg.content as z.infer<typeof AnthropicContentBlockSchema>[])
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => ({ text: b.text }));
  }
  return [];
}

function extractFromGemini(contents: z.infer<typeof GeminiContentsSchema>): ParsedInput {
  let systemText: string | null = null;
  const systemContent = contents.find((c) => c.role === "system");
  if (systemContent) {
    const textParts = systemContent.parts
      .filter((p): p is z.infer<typeof GeminiTextPartSchema> => "text" in p)
      .map((p) => p.text);
    if (textParts.length > 0) systemText = textParts.join("\n");
  }

  return { systemText, userParts: extractLastUserMessageGemini(contents) };
}

function extractLastUserMessageGemini(contents: z.infer<typeof GeminiContentsSchema>): TextPart[] {
  for (let i = contents.length - 1; i >= 0; i--) {
    const content = contents[i];
    if (content.role !== "user" && (content.role || i === 0)) continue;

    return content.parts
      .filter((p): p is z.infer<typeof GeminiTextPartSchema> => "text" in p)
      .map((p) => ({ text: p.text }));
  }
  return [];
}
