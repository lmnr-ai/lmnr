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

export interface ExtractedTool {
  name: string;
  input: unknown;
}

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

const openaiAllTools = (msgs: LooseOpenAIMessage[]): ExtractedTool[] => {
  const tools: ExtractedTool[] = [];
  for (const m of msgs) {
    if (!Array.isArray(m.tool_calls)) continue;
    for (const tc of m.tool_calls) {
      tools.push({ name: tc.function.name, input: tc.function.arguments });
    }
  }
  return tools;
};

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

const anthropicAllTools = (msgs: AnthropicMessage[]): ExtractedTool[] => {
  const tools: ExtractedTool[] = [];
  for (const m of msgs) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (anthropicIsTool(b) && (b.type === "tool_use" || b.type === "server_tool_use")) {
        tools.push({ name: b.name, input: b.input });
      }
    }
  }
  return tools;
};

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

const geminiHasText = (contents: GeminiContent[]): boolean =>
  contents.some((c) => c.parts.some((p) => "text" in p && !isBlank(p.text)));

const geminiAllTools = (contents: GeminiContent[]): ExtractedTool[] => {
  const tools: ExtractedTool[] = [];
  for (const c of contents) {
    for (const p of c.parts) {
      if ("functionCall" in p && p.functionCall) {
        tools.push({ name: p.functionCall.name, input: p.functionCall.args ?? {} });
      }
    }
  }
  return tools;
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

const langchainAllTools = (msgs: LangChainAssistant[]): ExtractedTool[] => {
  const tools: ExtractedTool[] = [];
  for (const m of msgs) {
    if (!Array.isArray(m.tool_calls)) continue;
    for (const tc of m.tool_calls) {
      tools.push({ name: tc.name, input: tc.arguments });
    }
  }
  return tools;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const tryOpenAI = (data: unknown): ExtractedTool[] | null => {
  const msgs = parseOpenAI(data);
  if (!msgs || msgs.some(openaiHasText)) return null;
  const tools = openaiAllTools(msgs);
  return tools.length > 0 ? tools : null;
};

const tryAnthropic = (data: unknown): ExtractedTool[] | null => {
  const msgs = parseAnthropicOutput(data);
  if (!msgs || anthropicHasText(msgs)) return null;
  const tools = anthropicAllTools(msgs);
  return tools.length > 0 ? tools : null;
};

const tryGemini = (data: unknown): ExtractedTool[] | null => {
  const contents = parseGeminiOutput(data);
  if (!contents || geminiHasText(contents)) return null;
  const tools = geminiAllTools(contents);
  return tools.length > 0 ? tools : null;
};

const tryLangChain = (data: unknown): ExtractedTool[] | null => {
  const msgs = parseLangChain(data);
  if (!msgs || langchainHasText(msgs)) return null;
  const tools = langchainAllTools(msgs);
  return tools.length > 0 ? tools : null;
};

/**
 * If an LLM output has tool calls but no visible text/thinking, return all
 * tool blocks as `{ name, input }` pairs so the caller can route them through
 * the preview pipeline individually. Returns null when no provider matches or
 * the output has displayable text.
 * Pass `hint` from `detectOutputStructure` to skip non-matching parsers.
 */
export const extractToolsIfToolOnly = (data: unknown, hint?: ProviderHint): ExtractedTool[] | null => {
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
