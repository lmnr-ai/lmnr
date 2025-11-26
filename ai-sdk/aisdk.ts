import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, jsonSchema, tool } from 'ai';
import type { ModelMessage, ToolChoice, ToolSet } from 'ai';

import type { GenerateResponse, Provider, ProviderApiKey } from './types';
import { decryptApiKey } from './crypto';

export type StructuredOutput = { [key: PropertyKey]: StructuredOutput | string | number | boolean | null | StructuredOutput[] } | null;

const providerFactories: Record<Provider, (options: Record<string, any>) => (model: string) => any> = {
  openai: createOpenAI,
  anthropic: createAnthropic,
  gemini: createGoogleGenerativeAI,
  groq: createGroq,
  mistral: createMistral,
  bedrock: createAmazonBedrock,
  'openai-azure': createAzure,
};

const isProvider = (value: string): value is Provider =>
  ['openai', 'anthropic', 'gemini', 'groq', 'mistral', 'bedrock', 'openai-azure'].includes(value as Provider);

type BaseParams = Record<string, unknown>;

export function parseTools(tools?: string): ToolSet | undefined {
  if (!tools) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(tools) as Record<string, { description?: string; parameters: object }>;
    return Object.entries(parsed).reduce((acc, [toolName, toolItem]) => {
      acc[toolName] = tool({
        ...toolItem,
        inputSchema: jsonSchema(toolItem.parameters ?? {}),
      });
      return acc;
    }, {} as ToolSet);
  } catch {
    throw new Error('tools must be valid JSON');
  }
}

export async function runAiSdkRequest(params: {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  tools?: ToolSet;
  toolChoice?: ToolChoice<ToolSet>;
  structuredOutput?: StructuredOutput;
  providerOptions?: unknown;
  provider_api_key: ProviderApiKey;
}): Promise<GenerateResponse> {
  const decryptedKey = await decryptProviderApiKey(params.provider_api_key);
  const modelInstance = resolveModel(params.model, decryptedKey);

  const baseParams = createBaseParams(modelInstance, params.messages, {
    temperature: params.temperature,
    topK: params.topK,
    topP: params.topP,
    providerOptions: params.providerOptions,
  });

  const result = params.structuredOutput
    ? await getStructuredResult(baseParams, params.structuredOutput, params.maxTokens)
    : await generateText(
      createTextParams(baseParams, {
        maxTokens: params.maxTokens,
        tools: params.tools,
        toolChoice: params.toolChoice,
      }) as Parameters<typeof generateText>[0]
    );

  return normalizeResult(result);
}

function createBaseParams(
  modelInstance: ReturnType<ReturnType<(typeof providerFactories)[Provider]>>,
  messages: ModelMessage[],
  options: {
    temperature?: number;
    topK?: number;
    topP?: number;
    providerOptions?: unknown;
  }
): BaseParams {
  const params: BaseParams = {
    model: modelInstance,
    messages,
  };

  if (options.providerOptions !== undefined) {
    params.providerOptions = options.providerOptions;
  }
  if (typeof options.temperature === 'number') {
    params.temperature = options.temperature;
  }
  if (typeof options.topK === 'number') {
    params.topK = options.topK;
  }
  if (typeof options.topP === 'number') {
    params.topP = options.topP;
  }

  return params;
}

function createTextParams(
  baseParams: BaseParams,
  options: {
    maxTokens?: number;
    tools?: ToolSet;
    toolChoice?: ToolChoice<ToolSet>;
  }
): BaseParams {
  const params: BaseParams = {
    ...baseParams,
  };

  if (typeof options.maxTokens === 'number') {
    params.maxOutputTokens = options.maxTokens;
  }
  if (options.tools !== undefined) {
    params.tools = options.tools;
  }
  if (options.toolChoice !== undefined) {
    params.toolChoice = options.toolChoice;
  }

  return params;
}

async function getStructuredResult(
  baseParams: BaseParams,
  structuredOutput: NonNullable<StructuredOutput>,
  maxTokens?: number
) {
  const objectParams: BaseParams = {
    ...baseParams,
    schema: jsonSchema(structuredOutput),
  };

  if (typeof maxTokens === 'number') {
    objectParams.maxOutputTokens = maxTokens;
  }

  const objectResult = await generateObject(objectParams as Parameters<typeof generateObject>[0]);

  return {
    ...objectResult,
    text: JSON.stringify(objectResult.object, null, 2),
    reasoning: [],
    toolCalls: [],
    content: [],
    files: [],
    sources: [],
    reasoningText: '',
  };
}

function normalizeResult(result: any): GenerateResponse {
  return {
    text: result?.text ?? (result?.object ? JSON.stringify(result.object) : ''),
    content: result?.content ?? [],
    reasoning: result?.reasoning ?? [],
    reasoningText: result?.reasoningText ?? '',
    files: result?.files ?? [],
    sources: result?.sources ?? [],
    toolCalls: result?.toolCalls ?? [],
    staticToolCalls: result?.staticToolCalls ?? [],
    dynamicToolCalls: result?.dynamicToolCalls ?? [],
    toolResults: result?.toolResults ?? [],
    staticToolResults: result?.staticToolResults ?? [],
    dynamicToolResults: result?.dynamicToolResults ?? [],
    finishReason: result?.finishReason,
    usage: result?.usage ?? {},
    totalUsage: result?.totalUsage ?? {},
    warnings: result?.warnings,
    request: result?.request,
    response: result?.response,
    object: result?.object,
  };
}

async function decryptProviderApiKey(providerKey: ProviderApiKey): Promise<string> {
  return decryptApiKey(providerKey.name, providerKey.nonce, providerKey.value);
}

function resolveModel(modelKey: string, apiKey: string) {
  const [providerSegment, modelName] = modelKey.split(':') as [string, string | undefined];

  if (!providerSegment || !modelName) {
    throw new Error('Model value must include provider prefix (e.g. gemini:gemini-2.5-flash)');
  }

  if (!isProvider(providerSegment)) {
    throw new Error(`Unsupported provider: ${providerSegment}`);
  }

  const createProvider = providerFactories[providerSegment];

  if (!createProvider) {
    throw new Error(`Provider ${providerSegment} is not configured`);
  }

  try {
    const providerInstance = createProvider({ apiKey });
    return providerInstance(modelName);
  } catch (error) {
    throw new Error(`Failed to initialize provider ${providerSegment}`);
  }
}