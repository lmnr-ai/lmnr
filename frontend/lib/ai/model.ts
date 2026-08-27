import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Model tiers used across AI features (chat with trace, SQL generation, name generation).
 * Each tier maps to a specific model per provider.
 */
type ModelTier = "small" | "medium" | "large";

type LLMProvider = "openai" | "gemini" | "bedrock";
type LlmDefaultHeaders = Record<string, string>;

// Per-provider defaults. Used when LLM_MODEL_<TIER> is not set.
const DEFAULT_MODELS: Record<LLMProvider, Record<ModelTier, string>> = {
  gemini: {
    small: "gemini-3.1-flash-lite",
    medium: "gemini-3-flash-preview",
    large: "gemini-3.1-pro-preview",
  },
  bedrock: {
    small: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    medium: "us.anthropic.claude-sonnet-4-6",
    large: "us.anthropic.claude-opus-4-7",
  },
  openai: {
    small: "gpt-5.4-mini",
    medium: "gpt-5.4",
    large: "gpt-5.5",
  },
};

function hasBedrockCreds(): boolean {
  return !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.AWS_REGION;
}

function getConfiguredLLMProvider(): LLMProvider | null {
  const provider = process.env.LLM_PROVIDER;
  if (provider === "bedrock") {
    return hasBedrockCreds() ? "bedrock" : null;
  }
  if (provider === "openai" || provider === "gemini") {
    return process.env.LLM_API_KEY ? provider : null;
  }
  return null;
}

/**
 * Non-throwing check: true when a supported AI provider has credentials configured.
 * Mirrors the runtime contract of `getLanguageModel` so feature flags gating AI
 * features don't light up UI that will throw on first call.
 */
export function isAiProviderConfigured(): boolean {
  return getConfiguredLLMProvider() !== null && hasValidLlmDefaultHeaders();
}

function resolveModelName(provider: LLMProvider, tier: ModelTier): string {
  return process.env[`LLM_MODEL_${tier.toUpperCase()}`] || DEFAULT_MODELS[provider][tier];
}

export function parseLlmDefaultHeaders(value = process.env.LLM_DEFAULT_HEADERS_JSON): LlmDefaultHeaders | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid LLM_DEFAULT_HEADERS_JSON: expected a JSON object with string values (${message})`, {
      cause: error,
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid LLM_DEFAULT_HEADERS_JSON: expected a JSON object with string values");
  }

  const headers: LlmDefaultHeaders = {};
  for (const [name, headerValue] of Object.entries(parsed)) {
    if (typeof headerValue !== "string") {
      throw new Error(`Invalid LLM_DEFAULT_HEADERS_JSON: header '${name}' value must be a string`);
    }
    validateHeader(name, headerValue);
    headers[name] = headerValue;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

let hasWarnedAboutHeaders = false;

function hasValidLlmDefaultHeaders(): boolean {
  try {
    parseLlmDefaultHeaders();
    return true;
  } catch (error) {
    if (!hasWarnedAboutHeaders) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`AI provider failed to configure: ${message}`);
      hasWarnedAboutHeaders = true;
    }
    return false;
  }
}

function validateHeader(name: string, value: string): void {
  try {
    new Headers([[name, value]]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid LLM_DEFAULT_HEADERS_JSON: invalid header '${name}' (${message})`, {
      cause: error,
    });
  }
}

export function getLanguageModel(tier: ModelTier = "large"): LanguageModel {
  const provider = getConfiguredLLMProvider();
  if (!provider) {
    throw new Error(
      "No AI provider configured. Set LLM_PROVIDER to openai, gemini, or bedrock. " +
        "openai/gemini require LLM_API_KEY (with optional LLM_BASE_URL); " +
        "bedrock requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION."
    );
  }

  const modelName = resolveModelName(provider, tier);

  if (provider === "bedrock") {
    const bedrock = createAmazonBedrock();
    return bedrock(modelName);
  }

  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL;
  const headers = parseLlmDefaultHeaders();

  if (provider === "openai") {
    const openai = createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(headers ? { headers } : {}) });
    return openai(modelName);
  }

  const google = createGoogleGenerativeAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(headers ? { headers } : {}) });
  return google(modelName);
}
