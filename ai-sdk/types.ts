import type { ModelMessage, ToolChoice, ToolSet } from 'ai';

export type Provider = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'mistral' | 'bedrock' | 'openai-azure';

type GoogleProviderOptions = {
  google?: {
    thinkingConfig?: {
      includeThoughts?: boolean;
      thinkingBudget?: number;
    };
  };
};

export interface ProviderApiKey {
  name: string;
  nonce: string;
  value: string;
}

export interface GenerateRequest<T extends ToolSet = ToolSet> {
  model: `${Provider}:${string}`;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  providerOptions?: GoogleProviderOptions | Record<string, unknown>;
  messages: ModelMessage[];
  tools?: string;
  toolChoice?: ToolChoice<T>;
  structuredOutput?: string;
  provider_api_key: ProviderApiKey;
}

export type GenerateResponse = {
  text: string;
  content: unknown[];
  reasoning: unknown[];
  reasoningText: string;
  files: unknown[];
  sources: unknown[];
  toolCalls: unknown[];
  staticToolCalls: unknown[];
  dynamicToolCalls: unknown[];
  toolResults: unknown[];
  staticToolResults: unknown[];
  dynamicToolResults: unknown[];
  finishReason?: string;
  usage: unknown;
  totalUsage: unknown;
  warnings?: unknown;
  request?: unknown;
  response?: unknown;
  object?: unknown;
};