import { type z } from "zod/v4";

import {
  AnthropicTextBlockSchema,
  AnthropicThinkingBlockSchema,
  parseAnthropicOutput,
} from "@/lib/spans/types/anthropic";
import { type GeminiContentSchema, GeminiTextPartSchema, parseGeminiOutput } from "@/lib/spans/types/gemini";
import {
  LangChainAssistantMessageSchema,
  LangChainMessagesSchema,
  LangChainTextPartSchema,
} from "@/lib/spans/types/langchain";
import { type OpenAIMessageSchema, OpenAITextPartSchema, parseOpenAIOutput } from "@/lib/spans/types/openai";

import { type ProviderHint } from "./utils.ts";

/**
 * A match resolves the span preview to rendered text. All provider matchers
 * go through their respective Zod schemas, so no ad-hoc structural checks or
 * Mustache templates are needed here.
 */
export interface ProviderKeyMatch {
  rendered: string;
}

const joinNonEmpty = (parts: string[]): string => parts.filter((p) => p.length > 0).join("\n\n");

// ---------------------------------------------------------------------------
// Per-provider renderers — each takes a message validated by the provider's
// canonical output schema and extracts its user-visible text.
// ---------------------------------------------------------------------------

const renderOpenAIMessage = (msg: z.infer<typeof OpenAIMessageSchema>): string => {
  const content = "content" in msg ? msg.content : null;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return joinNonEmpty(content.map((part) => OpenAITextPartSchema.safeParse(part).data?.text ?? ""));
};

const renderAnthropicMessage = (msg: { content: unknown }): string => {
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";
  return joinNonEmpty(
    msg.content.map(
      (block) =>
        AnthropicThinkingBlockSchema.safeParse(block).data?.thinking ??
        AnthropicTextBlockSchema.safeParse(block).data?.text ??
        ""
    )
  );
};

const renderGeminiMessage = (msg: z.infer<typeof GeminiContentSchema>): string =>
  joinNonEmpty(msg.parts.map((part) => GeminiTextPartSchema.safeParse(part).data?.text ?? ""));

const renderLangChainMessage = (msg: z.infer<typeof LangChainAssistantMessageSchema>): string => {
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";
  return joinNonEmpty(msg.content.map((part) => LangChainTextPartSchema.safeParse(part).data?.text ?? ""));
};

// ---------------------------------------------------------------------------
// Pattern definitions — each pattern validates with schemas and renders.
// ---------------------------------------------------------------------------

interface ProviderPattern {
  provider: ProviderHint;
  match: (data: unknown) => ProviderKeyMatch | null;
}

const patterns: ProviderPattern[] = [
  {
    provider: "openai",
    match: (data) => {
      const messages = parseOpenAIOutput(data);
      return messages ? { rendered: joinNonEmpty(messages.map(renderOpenAIMessage)) } : null;
    },
  },
  {
    provider: "anthropic",
    match: (data) => {
      const messages = parseAnthropicOutput(data);
      return messages ? { rendered: joinNonEmpty(messages.map(renderAnthropicMessage)) } : null;
    },
  },
  {
    provider: "gemini",
    match: (data) => {
      const messages = parseGeminiOutput(data);
      return messages ? { rendered: joinNonEmpty(messages.map(renderGeminiMessage)) } : null;
    },
  },
  {
    provider: "langchain",
    match: (data) => {
      const single = LangChainAssistantMessageSchema.safeParse(
        Array.isArray(data) && data.length === 1 ? data[0] : data
      );
      if (single.success) return { rendered: renderLangChainMessage(single.data) };

      const multi = LangChainMessagesSchema.safeParse(data);
      if (!multi.success) return null;
      const assistants = multi.data.filter(
        (m): m is z.infer<typeof LangChainAssistantMessageSchema> => m.role === "assistant" || m.role === "ai"
      );
      return assistants.length > 0 ? { rendered: joinNonEmpty(assistants.map(renderLangChainMessage)) } : null;
    },
  },
];

export const matchProviderKey = (data: unknown, providerHint?: ProviderHint): ProviderKeyMatch | null => {
  if (providerHint && providerHint !== "unknown") {
    for (const pattern of patterns) {
      if (pattern.provider === providerHint) {
        const result = pattern.match(data);
        if (result) return result;
      }
    }
  }

  for (const pattern of patterns) {
    const result = pattern.match(data);
    if (result) return result;
  }
  return null;
};
