import { isString } from "lodash";
import { z } from "zod/v4";

import {
  type AnthropicContentBlockSchema,
  type AnthropicMessagesSchema,
  parseAnthropicOutput,
} from "@/lib/spans/types/anthropic";
import { type GeminiContentSchema, type GeminiPartSchema, parseGeminiOutput } from "@/lib/spans/types/gemini";
import { LangChainAssistantMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";

import { type ProviderHint } from "./utils";

type AnthropicMessage = z.infer<typeof AnthropicMessagesSchema>[number];
type AnthropicBlock = z.infer<typeof AnthropicContentBlockSchema>;
type GeminiContent = z.infer<typeof GeminiContentSchema>;
type GeminiPart = z.infer<typeof GeminiPartSchema>;
type LangChainAssistant = z.infer<typeof LangChainAssistantMessageSchema>;

const isBlank = (v: unknown): boolean => v === null || v === undefined || (isString(v) && v.trim() === "");

// ---------------------------------------------------------------------------
// OpenAI — the canonical schema types `function.arguments` as a string, but
// span payloads reach us already deep-JSON-parsed. Use a lenient schema that
// accepts either shape so detection still works after deep parsing.
// ---------------------------------------------------------------------------

const LooseOpenAIToolCallSchema = z.looseObject({
  function: z.looseObject({ name: z.string(), arguments: z.unknown() }),
});

const LooseOpenAIAssistantSchema = z.looseObject({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.array(z.unknown()), z.null()]).optional(),
  tool_calls: z.array(LooseOpenAIToolCallSchema).nullable().optional(),
});

const LooseOpenAIChoiceSchema = z.looseObject({ message: LooseOpenAIAssistantSchema });
const LooseOpenAIOutputSchema = z.union([LooseOpenAIChoiceSchema, z.array(LooseOpenAIChoiceSchema)]);

type LooseOpenAIMessage = z.infer<typeof LooseOpenAIAssistantSchema>;

const parseOpenAI = (data: unknown): LooseOpenAIMessage[] | null => {
  const result = LooseOpenAIOutputSchema.safeParse(data);
  if (!result.success) return null;
  const choices = Array.isArray(result.data) ? result.data : [result.data];
  return choices.map((c) => c.message);
};

const openaiHasText = (m: LooseOpenAIMessage): boolean => {
  const c = m.content;
  if (isString(c)) return !isBlank(c);
  if (Array.isArray(c)) {
    return c.some((p) => {
      if (typeof p !== "object" || p === null) return false;
      const part = p as { type?: string; text?: unknown };
      return part.type === "text" && !isBlank(part.text);
    });
  }
  return false;
};

const openaiHasTool = (m: LooseOpenAIMessage): boolean => Array.isArray(m.tool_calls) && m.tool_calls.length > 0;

const openaiFirstTool = (msgs: LooseOpenAIMessage[]): unknown => msgs.find(openaiHasTool)?.tool_calls?.[0] ?? null;

// ---------------------------------------------------------------------------
// Anthropic — uses the canonical schema; tool_use.input is z.unknown() so
// deep-parsed payloads validate fine.
// ---------------------------------------------------------------------------

const anthropicIsTool = (b: AnthropicBlock): boolean => b.type === "tool_use" || b.type === "server_tool_use";

const anthropicHasText = (msgs: AnthropicMessage[]): boolean =>
  msgs.some((m) => {
    if (!Array.isArray(m.content)) return isString(m.content) && !isBlank(m.content);
    return m.content.some((b) => {
      if (b.type === "text") return !isBlank(b.text);
      if (b.type === "thinking") return !isBlank(b.thinking);
      return false;
    });
  });

const anthropicHasTool = (msgs: AnthropicMessage[]): boolean =>
  msgs.some((m) => Array.isArray(m.content) && m.content.some(anthropicIsTool));

const anthropicFirstTool = (msgs: AnthropicMessage[]): unknown => {
  for (const m of msgs) {
    if (!Array.isArray(m.content)) continue;
    const block = m.content.find(anthropicIsTool);
    if (block) return block;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

const geminiIsFnCall = (p: GeminiPart): boolean => "functionCall" in p;

const geminiHasText = (contents: GeminiContent[]): boolean =>
  contents.some((c) => c.parts.some((p) => "text" in p && !isBlank(p.text)));

const geminiHasTool = (contents: GeminiContent[]): boolean => contents.some((c) => c.parts.some(geminiIsFnCall));

const geminiFirstTool = (contents: GeminiContent[]): unknown => {
  for (const c of contents) {
    const part = c.parts.find(geminiIsFnCall);
    if (part) return part;
  }
  return null;
};

// ---------------------------------------------------------------------------
// LangChain
// ---------------------------------------------------------------------------

const parseLangChain = (data: unknown): LangChainAssistant[] | null => {
  const singleInput = Array.isArray(data) && data.length === 1 ? data[0] : data;
  const single = LangChainAssistantMessageSchema.safeParse(singleInput);
  if (single.success) return [single.data];
  const multi = LangChainMessagesSchema.safeParse(data);
  if (!multi.success) return null;
  return multi.data.filter((m): m is LangChainAssistant => m.role === "assistant" || m.role === "ai");
};

const langchainHasText = (msgs: LangChainAssistant[]): boolean =>
  msgs.some((m) => {
    const c = m.content;
    if (isString(c)) return !isBlank(c);
    if (Array.isArray(c)) {
      return c.some((p) => typeof p === "object" && p !== null && "type" in p && p.type === "text" && !isBlank(p.text));
    }
    return false;
  });

const langchainHasTool = (msgs: LangChainAssistant[]): boolean =>
  msgs.some((m) => Array.isArray(m.tool_calls) && m.tool_calls.length > 0);

const langchainFirstTool = (msgs: LangChainAssistant[]): unknown =>
  msgs.find((m) => m.tool_calls?.length)?.tool_calls?.[0] ?? null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const tryOpenAI = (data: unknown): unknown => {
  const msgs = parseOpenAI(data);
  if (!msgs || !msgs.some(openaiHasTool) || msgs.some(openaiHasText)) return null;
  return openaiFirstTool(msgs);
};

const tryAnthropic = (data: unknown): unknown => {
  const msgs = parseAnthropicOutput(data);
  if (!msgs || !anthropicHasTool(msgs) || anthropicHasText(msgs)) return null;
  return anthropicFirstTool(msgs);
};

const tryGemini = (data: unknown): unknown => {
  const contents = parseGeminiOutput(data);
  if (!contents || !geminiHasTool(contents) || geminiHasText(contents)) return null;
  return geminiFirstTool(contents);
};

const tryLangChain = (data: unknown): unknown => {
  const msgs = parseLangChain(data);
  if (!msgs || !langchainHasTool(msgs) || langchainHasText(msgs)) return null;
  return langchainFirstTool(msgs);
};

/**
 * If an LLM output has tool calls but no visible text/thinking, return the
 * first tool block so the caller can route it through the preview pipeline.
 * Returns null when no provider matches or the output has displayable text.
 * Pass `hint` from `detectOutputStructure` to skip non-matching parsers.
 */
export const extractFirstToolIfToolOnly = (data: unknown, hint?: ProviderHint): unknown => {
  switch (hint) {
    case "openai":
      return tryOpenAI(data);
    case "anthropic":
      return tryAnthropic(data);
    case "gemini":
      return tryGemini(data);
    case "langchain":
      return tryLangChain(data);
  }
  // No hint or "unknown" — try each parser until one matches.
  return tryOpenAI(data) ?? tryAnthropic(data) ?? tryGemini(data) ?? tryLangChain(data);
};
