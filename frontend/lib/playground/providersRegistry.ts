import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";

import { Provider } from "@/lib/pipeline/types";

const providersInstanceMap = {
  openai: createOpenAI,
  gemini: createGoogleGenerativeAI,
  mistral: createMistral,
  anthropic: createAnthropic,
  groq: createGroq,
  bedrock: createAmazonBedrock,
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
    const providerInstance = createProvider({ apiKey });
    return providerInstance(model);
  } catch (error) {
    throw new Error(`Failed to initialize model ${key}`);
  }
};
