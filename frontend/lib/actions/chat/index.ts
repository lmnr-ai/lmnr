import { generateText, GenerateTextResult, modelMessageSchema, ToolSet } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { Provider, providerToApiKey } from "@/components/playground/types";
import { parseTools } from "@/components/playground/utils";
import { decodeApiKey } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { providerApiKeys } from "@/lib/db/migrations/schema";
import { getModel } from "@/lib/playground/providersRegistry";

import { createSpanAttributes, sendSpanData, type SpanData } from "./utils";

export const PlaygroundParamsSchema = z.object({
  messages: z.array(modelMessageSchema).min(1),
  model: z.string().min(1),
  projectId: z.string().min(1),
  providerOptions: z.any().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().positive().optional(),
  tools: z.string().optional(),
  toolChoice: z.any().optional(),
  playgroundId: z.string().optional(),
  abortSignal: z.any().optional(),
});

export interface ChatGenerationResult {
  result: GenerateTextResult<ToolSet, {}>;
  startTime: Date;
  endTime: Date;
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
    abortSignal,
  } = params;

  const provider = model.split(":")[0] as Provider;
  const decodedKey = await getProviderApiKey(projectId, provider);
  const parsedTools = parseTools(tools);

  const startTime = new Date();

  const result = await generateText({
    abortSignal,
    model: getModel(model as `${Provider}:${string}`, decodedKey),
    messages,
    maxOutputTokens: maxTokens,
    temperature,
    topK,
    topP,
    providerOptions,
    tools: parsedTools,
    toolChoice,
  });

  const endTime = new Date();

  return {
    result,
    startTime,
    endTime,
  };
}

export async function handleChatGeneration(
  params: z.infer<typeof PlaygroundParamsSchema>
): Promise<GenerateTextResult<ToolSet, {}>> {
  const { messages, model, projectId, maxTokens, temperature, topP, topK, playgroundId } = params;

  const { result, startTime, endTime } = await generateChatResponse(params);

  // Ensure the result has safe fallback values for required properties
  const safeResult: GenerateTextResult<ToolSet, {}> = {
    ...result,
    text: result.text || "",
    reasoning: result.reasoning || [],
    toolCalls: result.toolCalls || [],
    usage: result.usage || {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
    },
    totalUsage: result.totalUsage || {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
    },
    content: result.content || [],
    files: result.files || [],
    sources: result.sources || [],
    reasoningText: result.reasoningText || "",
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
    };
    const attributes = createSpanAttributes(spanData);
    await sendSpanData(projectId, provider, spanData, attributes);
  } catch (error) {
    console.error("Error saving run to history.", error);
  }
  return safeResult;
}
