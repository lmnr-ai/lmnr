import {
  generateText,
  type GenerateTextResult,
  jsonSchema,
  type LanguageModelUsage,
  modelMessageSchema,
  Output,
  type ToolSet,
  type TypedToolCall,
} from "ai";
import { z } from "zod/v4";

import { parseTools } from "@/components/playground/utils";
import { resolveProjectLlmProfile } from "@/lib/actions/llm-profiles/resolve";
import { providerFamily } from "@/lib/actions/llm-profiles/schema";
import { languageModelFromProfile } from "@/lib/ai/profile-model";
import { extractInstructions } from "@/lib/playground/utils";

import { type JsonObject } from "./types";
import { createSpanAttributes, sendSpanData, type SpanData } from "./utils";

export type { JsonObject };

export const zJsonObject = z
  .string()
  .optional()
  .transform((str, ctx): JsonObject => {
    if (!str) {
      return null;
    }
    try {
      return JSON.parse(str);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: "Invalid JSON" });
      return z.NEVER;
    }
  });

export const PlaygroundParamsSchema = z.object({
  messages: z.array(modelMessageSchema).min(1),
  llmProfileId: z.guid("Select an LLM profile and a model"),
  llmModel: z.string().trim().min(1, "Select a model"),
  projectId: z.guid(),
  providerOptions: z.any().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().positive().optional(),
  tools: z
    .string()
    .optional()
    .transform((v) => parseTools(v)),
  toolChoice: z.any().optional(),
  structuredOutput: zJsonObject,
  playgroundId: z.guid().optional(),
  abortSignal: z.any().optional(),
});

const emptyUsage: LanguageModelUsage = {
  inputTokens: 0,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 0,
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
  totalTokens: 0,
};

export interface ChatGenerationResult {
  result: GenerateTextResult<ToolSet, Record<string, never>, never>;
  /** Vendor family reported as `gen_ai.system`. */
  provider: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Plain, serialization-safe result sent to the client.
 *
 * The AI SDK's `GenerateTextResult` is a class whose fields (`reasoning`,
 * `usage`, `finalStep`, ...) are prototype getters — they do NOT survive an
 * object spread or JSON serialization. So we materialize exactly what the
 * client and span-attribute builder need into own properties here.
 */
export interface PlaygroundChatResult {
  text: string;
  reasoningText: string;
  toolCalls: TypedToolCall<ToolSet>[];
  usage: LanguageModelUsage;
  finishReason: string | undefined;
  response?: { modelId?: string };
}

export async function generateChatResponse(
  params: z.infer<typeof PlaygroundParamsSchema>
): Promise<ChatGenerationResult> {
  const {
    messages,
    llmProfileId,
    llmModel,
    projectId,
    providerOptions,
    maxTokens,
    temperature,
    topP,
    topK,
    tools,
    toolChoice,
    structuredOutput,
    abortSignal,
  } = params;

  const resolved = await resolveProjectLlmProfile({ projectId, profileId: llmProfileId, model: llmModel });
  const model = languageModelFromProfile(resolved.profile, resolved.secrets, resolved.model);

  if (providerOptions?.google?.thinkingConfig) {
    const tc = providerOptions.google.thinkingConfig as Record<string, unknown>;
    if (tc.thinkingLevel != null) {
      delete tc.thinkingBudget;
    } else if (tc.thinkingBudget != null) {
      delete tc.thinkingLevel;
    }
  }

  const startTime = new Date();
  const prompt = extractInstructions(messages);

  let result: any;

  if (structuredOutput) {
    // Keep the live result instance — spreading it into a plain object would drop
    // the class getters (finalStep/reasoning/reasoningText/usage/...). The `text`
    // override for structured output is applied later in handleChatGeneration.
    result = await generateText({
      abortSignal,
      model,
      ...prompt,
      maxOutputTokens: maxTokens,
      temperature,
      topK,
      topP,
      providerOptions,
      output: Output.object({ schema: jsonSchema(structuredOutput) }),
    });
  } else {
    result = await generateText({
      abortSignal,
      model,
      ...prompt,
      maxOutputTokens: maxTokens,
      temperature,
      topK,
      topP,
      providerOptions,
      tools,
      toolChoice,
    });
  }

  const endTime = new Date();

  return {
    result,
    provider: providerFamily(resolved.profile.provider),
    startTime,
    endTime,
  };
}

export async function handleChatGeneration(
  params: z.infer<typeof PlaygroundParamsSchema>
): Promise<PlaygroundChatResult> {
  const parsedParams = PlaygroundParamsSchema.parse(params);
  const { messages, llmModel, projectId, maxTokens, temperature, topP, topK, playgroundId, structuredOutput } =
    parsedParams;

  const { result, provider, startTime, endTime } = await generateChatResponse(parsedParams);

  const finalStep = result.finalStep;

  // In v7, generateText + Output.object still surfaces reasoning (thinking models),
  // so we keep it. Structured runs don't pass tools, so toolCalls stays empty.
  const safeResult: PlaygroundChatResult = {
    text: structuredOutput ? JSON.stringify(result.output, null, 2) : result.text || "",
    reasoningText: finalStep?.reasoningText || "",
    toolCalls: result.toolCalls || [],
    usage: result.usage || emptyUsage,
    finishReason: result.finishReason,
    response: finalStep?.response ? { modelId: finalStep.response.modelId } : undefined,
  };

  try {
    const spanData: SpanData = {
      provider,
      model: llmModel,
      result: safeResult,
      messages,
      maxTokens,
      temperature,
      topP,
      topK,
      playgroundId,
      startTime,
      endTime,
      structuredOutput,
    };
    const attributes = createSpanAttributes(spanData);
    await sendSpanData(projectId, provider, spanData, attributes);
  } catch (error) {
    console.error("Error saving run to history.", error);
  }
  return safeResult;
}
