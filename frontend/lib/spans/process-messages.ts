import { type ModelMessage } from "ai";
import { type z } from "zod/v4";

import { convertToMessages, normalizeToMessages } from "@/lib/spans/types";
import { parseAiSdkMessages } from "@/lib/spans/types/ai-sdk";
import { type AnthropicMessagesSchema, parseAnthropicInput, parseAnthropicOutput } from "@/lib/spans/types/anthropic";
import { type GeminiContentsSchema, parseGeminiContents } from "@/lib/spans/types/gemini";
import { parseGenAIMessages } from "@/lib/spans/types/gen-ai";
import { LangChainMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { type OpenAIMessagesSchema, parseOpenAIInput, parseOpenAIOutput } from "@/lib/spans/types/openai";
import {
  type OpenAIResponsesItemsSchema,
  parseOpenAIResponsesInput,
  parseOpenAIResponsesOutput,
} from "@/lib/spans/types/openai-responses";

const ANTHROPIC_SIGNAL_TYPES = new Set(["tool_use", "tool_result", "thinking", "redacted_thinking"]);

const RESPONSES_TOOL_CALL_TYPES = new Set([
  "function_call",
  "custom_tool_call",
  "web_search_call",
  "file_search_call",
  "computer_call",
  "image_generation_call",
  "code_interpreter_call",
  "local_shell_call",
  "mcp_call",
  "mcp_list_tools",
  "mcp_approval_request",
]);

const RESPONSES_TOOL_OUTPUT_TYPES = new Set([
  "function_call_output",
  "computer_call_output",
  "local_shell_call_output",
  "mcp_approval_response",
  "custom_tool_call_output",
]);

export function responsesItemRole(item: { type?: string; role?: string } | undefined): string | undefined {
  if (!item) return undefined;
  if (item.role) return item.role;
  const t = item.type;
  if (!t || t === "message") return item.role;
  if (t === "reasoning") return "assistant";
  if (RESPONSES_TOOL_CALL_TYPES.has(t)) return "assistant";
  if (RESPONSES_TOOL_OUTPUT_TYPES.has(t)) return "tool";
  return undefined;
}

function contentHasAnthropicTypes(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b: any) => ANTHROPIC_SIGNAL_TYPES.has(b?.type));
}

function hasAnthropicSignals(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((m: any) => {
    if (Array.isArray(m?.content)) {
      return contentHasAnthropicTypes(m.content);
    }
    if (typeof m?.content === "string") {
      try {
        return contentHasAnthropicTypes(JSON.parse(m.content));
      } catch {
        return false;
      }
    }
    return false;
  });
}

export type ProcessedMessages =
  | { type: "langchain"; messages: z.infer<typeof LangChainMessagesSchema> }
  | { type: "openai"; messages: z.infer<typeof OpenAIMessagesSchema> }
  | { type: "openai-responses"; messages: z.infer<typeof OpenAIResponsesItemsSchema> }
  | { type: "anthropic"; messages: z.infer<typeof AnthropicMessagesSchema> }
  | { type: "gemini"; messages: z.infer<typeof GeminiContentsSchema> }
  | { type: "generic"; messages: (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] };

export function processMessages(rawData: unknown): ProcessedMessages {
  // Wrap loose shapes (single message object / bare parts array) so detectors can claim them.
  const data = normalizeToMessages(rawData);

  if (hasAnthropicSignals(data)) {
    const anthropicOutput = parseAnthropicOutput(data);
    if (anthropicOutput) {
      return { messages: anthropicOutput, type: "anthropic" };
    }

    const anthropicInput = parseAnthropicInput(data);
    if (anthropicInput) {
      return { messages: anthropicInput, type: "anthropic" };
    }
  }

  // OpenTelemetry GenAI semconv (`{role, parts: [{type: "text"|"tool_call"|...}]}`)
  // emitted by pydantic_ai v5 and other spec-compliant libraries. The backend
  // preserves the raw shape so we decode it here.
  //
  // Must run BEFORE OpenAI/LangChain/Gemini detectors: `OpenAIAssistantMessageSchema`
  // has every field optional except `role` and Zod silently strips unknown keys, so
  // `{role: "assistant", parts: [...], finish_reason: "stop"}` matches it and renders
  // as an empty OpenAI message. `looksLikeGenAIMessages` is narrow enough to run
  // early — it requires a `parts` array with an object carrying a GenAI `type`
  // discriminator, which none of the other formats emit.
  //
  // There is no dedicated `gen_ai` renderer: every GenAI part type maps losslessly
  // onto a ModelMessage content part (see `convertOne` in `gen-ai.ts`), so the
  // generic renderer is sufficient. Add one if the spec grows a part type with no
  // ModelMessage analogue.
  const genAIMessages = parseGenAIMessages(data);
  if (genAIMessages) {
    return { messages: genAIMessages, type: "generic" };
  }

  // Native Vercel AI SDK `ModelMessage[]` / verbatim LanguageModel prompts
  // (LAM-1922: the SDK sends `gen_ai.input.messages` / `gen_ai.output.messages`
  // verbatim, stored untouched by the server). Must run BEFORE the OpenAI
  // parsers: verbatim AI SDK messages are `{role, content}`-shaped and the
  // loose OpenAI zod schemas would otherwise claim them and render badly.
  // Detection requires an AI-SDK discriminator (dash-typed part, file part
  // with top-level data|url + mediaType, providerOptions/providerMetadata, or
  // the legacy server-reshaped `tool_call` part), so a pure
  // `[{role, content: "str"}]` array still falls through to the detectors
  // below. `looksLikeGenAIMessages` above keys off `parts`, not `content`, so
  // the two can never claim each other's payloads.
  const aiSdkMessages = parseAiSdkMessages(data);
  if (aiSdkMessages) {
    return { messages: aiSdkMessages, type: "generic" };
  }

  const openAIOutput = parseOpenAIOutput(data);
  if (openAIOutput) {
    return { messages: openAIOutput, type: "openai" };
  }

  const openAIInput = parseOpenAIInput(data);
  if (openAIInput) {
    return { messages: openAIInput, type: "openai" };
  }

  const responsesInput = parseOpenAIResponsesInput(data);
  if (responsesInput) {
    return { messages: responsesInput, type: "openai-responses" };
  }

  const responsesOutput = parseOpenAIResponsesOutput(data);
  if (responsesOutput) {
    return { messages: responsesOutput, type: "openai-responses" };
  }

  const langchainMessageResult = LangChainMessageSchema.safeParse(data);
  const langchainResult = LangChainMessagesSchema.safeParse(data);

  if (langchainMessageResult.success) {
    return {
      messages: [langchainMessageResult.data],
      type: "langchain",
    };
  }

  if (langchainResult.success) {
    return { messages: langchainResult.data, type: "langchain" };
  }

  const anthropicOutput = parseAnthropicOutput(data);
  if (anthropicOutput) {
    return { messages: anthropicOutput, type: "anthropic" };
  }

  const anthropicInput = parseAnthropicInput(data);
  if (anthropicInput) {
    return { messages: anthropicInput, type: "anthropic" };
  }

  const geminiContents = parseGeminiContents(data);
  if (geminiContents) {
    return { messages: geminiContents, type: "gemini" };
  }

  return {
    messages: convertToMessages(data as Parameters<typeof convertToMessages>[0]),
    type: "generic",
  };
}
