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
 * Build a synthetic messages array from the first and second elements
 * extracted by ClickHouse, then parse into typed system + user parts.
 * The second element is expected to be the first user message (arr[2]).
 */
export function parseExtractedMessages(firstMessage: string, secondMessage: string): ParsedInput | null {
  const parts: string[] = [];
  if (firstMessage) parts.push(firstMessage);
  if (secondMessage) parts.push(secondMessage);
  if (parts.length === 0) return null;

  const syntheticJson = `[${parts.join(",")}]`;
  const parsed = tryParseJson(syntheticJson);
  if (!parsed) return null;

  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return tryParseMessages(arr);
}

function tryParseMessages(arr: unknown[]): ParsedInput | null {
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

  return { systemText, userParts: extractFirstUserMessageOpenAI(messages) };
}

function extractFirstUserMessageOpenAI(messages: z.infer<typeof OpenAIMessagesSchema>): TextPart[] {
  for (const msg of messages) {
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

  return { systemText, userParts: extractFirstUserMessageAnthropic(messages) };
}

function extractFirstUserMessageAnthropic(messages: z.infer<typeof AnthropicMessagesSchema>): TextPart[] {
  for (const msg of messages) {
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

  return { systemText, userParts: extractFirstUserMessageGemini(contents) };
}

function extractFirstUserMessageGemini(contents: z.infer<typeof GeminiContentsSchema>): TextPart[] {
  for (const content of contents) {
    if (content.role === "user") {
      return content.parts
        .filter((p): p is z.infer<typeof GeminiTextPartSchema> => "text" in p)
        .map((p) => ({ text: p.text }));
    }
  }
  return [];
}
