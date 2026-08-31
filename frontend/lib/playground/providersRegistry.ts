import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";

import { type Provider } from "@/components/playground/types";

const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io/v1";

const createMiniMax = ({ apiKey }: { apiKey: string }) => {
  const configuredBaseURL = process.env.MINIMAX_BASE_URL?.trim() || DEFAULT_MINIMAX_BASE_URL;
  const baseURL = configuredBaseURL.replace(/\/+$/, "");

  if (baseURL.endsWith("/anthropic")) {
    const provider = createAnthropic({ apiKey, baseURL: `${baseURL}/v1` });
    return (model: string) => provider(model);
  }

  const provider = createOpenAI({ apiKey, baseURL });
  return (model: string) => provider.chat(model);
};

const providersInstanceMap = {
  openai: createOpenAI,
  gemini: createGoogleGenerativeAI,
  mistral: createMistral,
  anthropic: createAnthropic,
  groq: createGroq,
  bedrock: createAmazonBedrock,
  minimax: createMiniMax,
  ["openai-azure"]: createAzure,
};

export const getModel = <P extends Provider, K extends string>(key: `${P}:${K}`, apiKey: string) => {
  const [provider, model] = key.split(":") as [P, K];

  if (!provider || !model) {
    throw new Error(`Invalid key format: ${key}. Expected format: "provider:model"`);
  }

  const createProvider = providersInstanceMap[provider];

  if (!createProvider) {
    throw new Error(`Provider ${provider} not found`);
  }

  try {
    if (provider === "minimax") {
      const providerInstance = providersInstanceMap.minimax({ apiKey });
      return providerInstance(model);
    }

    const providerConfig = { apiKey };
    const providerInstance = createProvider(providerConfig);
    return providerInstance(model);
  } catch (error) {
    throw new Error(`Failed to initialize model ${key}`, {
      cause: error,
    });
  }
};
