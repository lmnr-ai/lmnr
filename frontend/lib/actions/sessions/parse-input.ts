import { type z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { type AnthropicContentBlockSchema, AnthropicMessagesSchema } from "@/lib/spans/types/anthropic";
import { GeminiContentsSchema, type GeminiTextPartSchema } from "@/lib/spans/types/gemini";
import { GenAIMessagesSchema, looksLikeGenAIMessages } from "@/lib/spans/types/gen-ai";
import { OpenAIMessagesSchema, type OpenAITextPartSchema } from "@/lib/spans/types/openai";

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
  // GenAI first: its part schema has a catch-all record branch, so the Zod
  // parse alone would false-positive on Gemini-shaped data. `looksLikeGenAIMessages`
  // gates on a GenAI type discriminator being present. Also handled before
  // OpenAI because an OTel assistant message `{role: "assistant", parts: [...]}`
  // can incidentally match OpenAIAssistantMessageSchema (content is optional).
  if (looksLikeGenAIMessages(arr)) {
    const genai = GenAIMessagesSchema.safeParse(arr);
    if (genai.success) return extractFromGenAI(genai.data);
  }

  const openai = OpenAIMessagesSchema.safeParse(arr);
  if (openai.success) return extractFromOpenAI(openai.data);

  const anthropic = AnthropicMessagesSchema.safeParse(arr);
  if (anthropic.success) return extractFromAnthropic(anthropic.data);

  const gemini = GeminiContentsSchema.safeParse(arr);
  if (gemini.success) return extractFromGemini(gemini.data);

  return null;
}

function extractFromGenAI(messages: z.infer<typeof GenAIMessagesSchema>): ParsedInput {
  let systemText: string | null = null;
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    const texts = extractGenAIText(systemMsg.parts);
    if (texts.length > 0) systemText = texts.join("\n");
  }

  return { systemText, userParts: extractFirstUserMessageGenAI(messages) };
}

function extractFirstUserMessageGenAI(messages: z.infer<typeof GenAIMessagesSchema>): TextPart[] {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    return extractGenAIText(msg.parts).map((text) => ({ text }));
  }
  return [];
}

// Collect the text-like content from a GenAI parts array, skipping non-text
// parts (tool calls, uri/blob, etc.). Bare-string parts count as implicit text
// to match the Rust-side `prepend_system_instructions` shape (e.g. pydantic_ai
// system_instructions emitted as `["Be helpful"]`).
function extractGenAIText(parts: z.infer<typeof GenAIMessagesSchema>[number]["parts"]): string[] {
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
