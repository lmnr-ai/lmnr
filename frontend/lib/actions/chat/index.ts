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
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { type Provider, providerToApiKey } from "@/components/playground/types";
import { parseTools } from "@/components/playground/utils";
import { decodeApiKey } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { providerApiKeys } from "@/lib/db/migrations/schema";
import { getModel } from "@/lib/playground/providersRegistry";

import { createSpanAttributes, sendSpanData, type SpanData } from "./utils";

export type JsonObject = { [key: PropertyKey]: JsonObject | string | number | boolean | null | JsonObject[] } | null;

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
  model: z.string().min(1),
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

export async function getProviderApiKey(projectId: string, provider: Provider): Promise<string> {
  const apiKeyName = providerToApiKey[provider];

  const [key] = await db
    .select({
      value: providerApiKeys.value,
      nonceHex: providerApiKeys.nonceHex,
      name: providerApiKeys.name,
      createdAt: providerApiKeys.createdAt,
    })
    .from(providerApiKeys)
    .where(and(eq(providerApiKeys.projectId, projectId), eq(providerApiKeys.name, apiKeyName)));

  if (!key) {
    throw new Error("No matching provider key found.");
  }

  return await decodeApiKey(key.name, key.nonceHex, key.value);
}

export async function generateChatResponse(
  params: z.infer<typeof PlaygroundParamsSchema>
): Promise<ChatGenerationResult> {
  const {
    messages,
    model,
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

  const provider = model.split(":")[0] as Provider;
  const decodedKey = await getProviderApiKey(projectId, provider);

  if (providerOptions?.google?.thinkingConfig) {
    const tc = providerOptions.google.thinkingConfig as Record<string, unknown>;
    if (tc.thinkingLevel != null) {
      delete tc.thinkingBudget;
    } else if (tc.thinkingBudget != null) {
      delete tc.thinkingLevel;
    }
  }

  const startTime = new Date();

  let result: any;

  if (structuredOutput) {
    // Keep the live result instance — spreading it into a plain object would drop
    // the class getters (finalStep/reasoning/reasoningText/usage/...). The `text`
    // override for structured output is applied later in handleChatGeneration.
    result = await generateText({
      abortSignal,
      model: getModel(model as `${Provider}:${string}`, decodedKey),
      messages,
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
      model: getModel(model as `${Provider}:${string}`, decodedKey),
      messages,
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
    startTime,
    endTime,
  };
}

export async function handleChatGeneration(
  params: z.infer<typeof PlaygroundParamsSchema>
): Promise<PlaygroundChatResult> {
  const parsedParams = PlaygroundParamsSchema.parse(params);
  const { messages, model, projectId, maxTokens, temperature, topP, topK, playgroundId, structuredOutput } =
    parsedParams;

  const { result, startTime, endTime } = await generateChatResponse(parsedParams);

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
    const provider = model.split(":")[0] as Provider;

    const spanData: SpanData = {
      provider,
      model,
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
