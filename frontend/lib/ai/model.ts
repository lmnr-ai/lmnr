import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Model tiers used across AI features (chat with trace, SQL generation, name generation).
 * Each tier maps to a specific model per provider.
 */
type ModelTier = "small" | "medium" | "large";

type LLMProvider = "openai" | "gemini";

// Bedrock keeps its existing hard-coded model list so BEDROCK_ENABLED=true works without
// requiring LLM_MODEL_* overrides. LLM_MODEL_* is ignored when Bedrock is active.
const BEDROCK_MODELS: Record<ModelTier, string> = {
  small: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  medium: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  large: "global.anthropic.claude-sonnet-4-6",
};

function hasBedrockCreds(): boolean {
  return !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.AWS_REGION;
}

function isBedrockConfigured(): boolean {
  return (process.env.BEDROCK_ENABLED === "true" || process.env.LLM_PROVIDER === "bedrock") && hasBedrockCreds();
}

function hasAllLlmModels(): boolean {
  return !!process.env.LLM_MODEL_SMALL && !!process.env.LLM_MODEL_MEDIUM && !!process.env.LLM_MODEL_LARGE;
}

function getConfiguredLLMProvider(): LLMProvider | null {
  const provider = process.env.LLM_PROVIDER;
  if (provider !== "openai" && provider !== "gemini") return null;
  if (!process.env.LLM_API_KEY) return null;
  if (!hasAllLlmModels()) return null;
  return provider;
}

/**
 * Non-throwing check: true when a supported AI provider has credentials configured
 * AND (for non-Bedrock providers) all three LLM_MODEL_* tier overrides are set.
 * This mirrors the runtime contract of `getLanguageModel` so feature flags gating
 * AI features don't light up UI that will throw on first call.
 */
export function isAiProviderConfigured(): boolean {
  return isBedrockConfigured() || getConfiguredLLMProvider() !== null;
}

function resolveModelName(tier: ModelTier): string {
  const override = process.env[`LLM_MODEL_${tier.toUpperCase()}`];
  if (!override) {
    throw new Error(
      `LLM_MODEL_${tier.toUpperCase()} is not set. Define LLM_MODEL_SMALL, LLM_MODEL_MEDIUM, and LLM_MODEL_LARGE.`
    );
  }
  return override;
}

export function getLanguageModel(tier: ModelTier = "large"): LanguageModel {
  if (isBedrockConfigured()) {
    const bedrock = createAmazonBedrock();
    return bedrock(BEDROCK_MODELS[tier]);
  }

  const provider = getConfiguredLLMProvider();
  if (!provider) {
    throw new Error(
      "No AI provider configured. Set LLM_PROVIDER (openai|gemini) with LLM_API_KEY (and optional LLM_BASE_URL), " +
        "or BEDROCK_ENABLED=true with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION for Anthropic Bedrock."
    );
  }

  const modelName = resolveModelName(tier);
  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL;

  if (provider === "openai") {
    const openai = createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    return openai(modelName);
  }

  const google = createGoogleGenerativeAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  return google(modelName);
}
